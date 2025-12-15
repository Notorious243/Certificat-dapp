import React, { useEffect, useRef, useState } from 'react';
import * as faceapi from 'face-api.js';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Lock, Unlock, ScanFace, CheckCircle2, AlertCircle } from 'lucide-react';
import { Button } from './ui/button';

const FaceLogin = ({ isOpen, onClose, onLogin, adminAccounts }) => {
    const videoRef = useRef(null);
    const [isLoading, setIsLoading] = useState(true);
    const [loadingState, setLoadingState] = useState('initial'); // initial, loading, ready, scanning, liveness, success, error
    const [error, setError] = useState(null);
    const [matchFound, setMatchFound] = useState(null);
    const [scanProgress, setScanProgress] = useState(0);
    const [livenessStep, setLivenessStep] = useState(null); // null -> 'smile'
    const pendingAdminRef = useRef(null);

    // Initialisation
    useEffect(() => {
        let isMounted = true;
        let detectionInterval = null;

        const cleanup = () => {
            if (detectionInterval) clearInterval(detectionInterval);
            if (videoRef.current && videoRef.current.srcObject) {
                videoRef.current.srcObject.getTracks().forEach(track => track.stop());
                videoRef.current.srcObject = null;
            }
        };

        const loadModelsAndStart = async () => {
            if (!isOpen) return;

            try {
                setIsLoading(true);
                setLoadingState('loading');
                setError(null);
                setMatchFound(null);
                setScanProgress(0);
                setLivenessStep(null);
                pendingAdminRef.current = null;

                // 1. Charger les modèles (Standardisé avec AdminPage)
                await Promise.all([
                    faceapi.nets.ssdMobilenetv1.loadFromUri('/models'),
                    faceapi.nets.faceLandmark68Net.loadFromUri('/models'),
                    faceapi.nets.faceRecognitionNet.loadFromUri('/models'),
                    faceapi.nets.faceExpressionNet.loadFromUri('/models') // ANTI-SPOOFING
                ]);

                // 2. Préparer les visages de référence (Admins)
                const labeledDescriptors = await loadLabeledImages();

                if (labeledDescriptors.length === 0) {
                    throw new Error("Aucun administrateur n'a configuré Face ID.");
                }

                // SECURITY BOOST: Threshold 0.4 (EXTREME Security) - Anti-Twin/Brother
                const faceMatcher = new faceapi.FaceMatcher(labeledDescriptors, 0.4);

                // 3. Démarrer la webcam (Optimisé pour Mobile)
                const constraints = {
                    video: {
                        facingMode: 'user', // Essentiel pour mobile (caméra frontale)
                        width: { ideal: 640 },
                        height: { ideal: 480 }
                    }
                };

                const stream = await navigator.mediaDevices.getUserMedia(constraints);

                if (videoRef.current && isMounted) {
                    videoRef.current.srcObject = stream;

                    // Attendre que la vidéo joue pour démarrer la détection
                    videoRef.current.onloadedmetadata = () => {
                        videoRef.current.play().catch(e => console.error("Play error:", e));
                        setIsLoading(false);
                        setLoadingState('scanning');
                        // Start detection loop
                        detectionInterval = startDetection(faceMatcher);
                    };
                }

            } catch (err) {
                console.error("FaceLogin Error:", err);
                if (isMounted) {
                    if (err.name === 'NotAllowedError' || err.name === 'NotFoundError') {
                        setError("Accès caméra refusé. Vérifiez vos permissions.");
                    } else if (err.message && err.message.includes('createInstance')) {
                        setError("Erreur chargement IA. Rafraîchissez la page.");
                    } else if (err.message && err.message.includes('Aucun administrateur')) {
                        setError(err.message);
                    } else {
                        setError("Impossible d'accéder à la caméra ou erreur IA.");
                    }
                    setLoadingState('error');
                }
                setIsLoading(false);
            }
        };

        if (isOpen) {
            loadModelsAndStart();
        }

        return () => {
            isMounted = false;
            cleanup();
        };
    }, [isOpen, adminAccounts]);

    const loadLabeledImages = async () => {
        const labeledDescriptors = [];
        // Filtrer uniquement les admins actifs avec Face ID configuré
        const activeAdmins = adminAccounts.filter(a => a.status === 'Active' && a.faceIdConfigured && a.faceIdData);

        console.log(`Loading ${activeAdmins.length} active Face ID profiles...`);

        for (const admin of activeAdmins) {
            try {
                if (admin.faceIdData) {
                    const img = new Image();
                    img.crossOrigin = "anonymous";
                    img.src = admin.faceIdData;

                    await new Promise((resolve, reject) => {
                        img.onload = resolve;
                        img.onerror = reject;
                    });

                    // Skip if dimensions are invalid
                    if (img.width === 0 || img.height === 0) continue;

                    try {
                        // Use explicit detection options for consistency
                        const detections = await faceapi.detectSingleFace(img, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
                            .withFaceLandmarks()
                            .withFaceDescriptor();

                        if (detections) {
                            labeledDescriptors.push(new faceapi.LabeledFaceDescriptors(admin.username, [detections.descriptor]));
                        }
                    } catch (tensorError) {
                        console.error(`Tensor error for ${admin.username}:`, tensorError);
                        continue;
                    }
                }
            } catch (err) {
                console.warn(`Skip admin ${admin.firstName}:`, err);
            }
        }
        return labeledDescriptors;
    };

    const startDetection = (faceMatcher) => {
        let currentPhase = 'scanning'; // Local variable to avoid closure staleness

        return setInterval(async () => {
            if (!videoRef.current || !isOpen) return;

            // Safety check for video readiness
            if (videoRef.current.readyState !== 4) return;

            try {
                // Détection visage + EXPRESSIONS
                const options = new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 });

                // We need expressions for liveness
                const detections = await faceapi.detectAllFaces(videoRef.current, options)
                    .withFaceLandmarks()
                    .withFaceDescriptors()
                    .withFaceExpressions();

                if (detections.length > 0) {
                    const detection = detections[0]; // Focus on primary face

                    // PHASE 1: IDENTITY CHECK
                    if (currentPhase === 'scanning') {
                        setScanProgress(prev => Math.min(prev + 2, 70));

                        const match = faceMatcher.findBestMatch(detection.descriptor);

                        if (match.label !== 'unknown' && !match.label.startsWith('error_')) {
                            // MATCH IDENTITÉ ! -> Passage en Liveness Check
                            const admin = adminAccounts.find(a => a.username === match.label);
                            if (admin) {
                                pendingAdminRef.current = admin;
                                currentPhase = 'liveness'; // Internal switch

                                setMatchFound(match.label);
                                setLoadingState('liveness'); // UI update
                                setLivenessStep('smile'); // UI: "Souriez !"
                                setScanProgress(75);
                            }
                        }
                    }
                    // PHASE 2: LIVENESS CHECK (SMILE)
                    else if (currentPhase === 'liveness') {
                        // Check Smile
                        if (detection.expressions.happy > 0.7) {
                            // SUCCESS !!
                            currentPhase = 'complete'; // Stop logic
                            setScanProgress(100);
                            setLoadingState('success');

                            setTimeout(() => {
                                if (pendingAdminRef.current) {
                                    onLogin(pendingAdminRef.current);
                                }
                            }, 1000);
                        }
                    }

                } else {
                    if (currentPhase === 'scanning') {
                        setScanProgress(prev => Math.max(prev - 2, 0));
                    }
                }
            } catch (err) {
                // Ignore transient errors in loop
                // console.warn(err); 
            }
        }, 200);
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xl p-4"
            >
                <div className="relative w-full max-w-sm mx-auto flex flex-col items-center">

                    {/* Header Text */}
                    <div className="mb-8 text-center space-y-2">
                        <motion.div
                            initial={{ y: -20, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            className="inline-flex items-center justify-center p-3 bg-white/10 rounded-full mb-4 backdrop-blur-md"
                        >
                            {loadingState === 'success' ? (
                                <Unlock className="w-8 h-8 text-green-400" />
                            ) : loadingState === 'liveness' ? (
                                <ScanFace className="w-8 h-8 text-yellow-400 animate-pulse" />
                            ) : (
                                <Lock className="w-8 h-8 text-white" />
                            )}
                        </motion.div>
                        <h2 className="text-2xl font-semibold text-white tracking-tight">
                            {loadingState === 'success' ? 'Identité Confirmée' :
                                loadingState === 'liveness' ? 'Vérification Vitalité' : 'Face ID Sécurisé'}
                        </h2>
                        <p className="text-sm text-white/60">
                            {loadingState === 'loading' && 'Initialisation IA...'}
                            {loadingState === 'scanning' && 'Positionnez votre visage'}
                            {loadingState === 'liveness' && <span className="text-yellow-400 font-bold text-lg">Souriez pour confirmer ! 😄</span>}
                            {loadingState === 'success' && `Bienvenue, ${matchFound}`}
                            {loadingState === 'error' && error}
                        </p>
                    </div>

                    {/* Main Scanner UI (Apple Style) */}
                    <div className="relative w-64 h-64">
                        {/* Border changing color based on state */}
                        <div className={`absolute inset-0 rounded-[2.5rem] overflow-hidden bg-black border-[3px] shadow-2xl transition-colors duration-500 ${loadingState === 'liveness' ? 'border-yellow-400' :
                                loadingState === 'success' ? 'border-green-500' : 'border-white/20'
                            }`}>
                            <video
                                ref={videoRef}
                                muted
                                playsInline
                                className={`w-full h-full object-cover transform scale-125 transition-all duration-700 ${loadingState === 'success' ? 'blur-md scale-100 opacity-50' : ''
                                    }`}
                            />

                            {/* Scanning Animation */}
                            {loadingState === 'scanning' && (
                                <div className="absolute inset-0">
                                    <motion.div
                                        animate={{
                                            background: [
                                                "linear-gradient(to bottom, transparent 0%, rgba(59,130,246,0.2) 50%, transparent 100%)",
                                                "linear-gradient(to bottom, transparent 0%, rgba(59,130,246,0.5) 50%, transparent 100%)"
                                            ],
                                            top: ["-100%", "100%"]
                                        }}
                                        transition={{
                                            duration: 2,
                                            repeat: Infinity,
                                            ease: "easeInOut"
                                        }}
                                        className="absolute w-full h-1/2 left-0"
                                    />
                                    {/* Face Tracking Indicator (Subtle frame) */}
                                    <div className="absolute inset-8 border-2 border-white/20 rounded-2xl opacity-50"></div>
                                </div>
                            )}

                            {/* Liveness Indicator/Overlay */}
                            <AnimatePresence>
                                {loadingState === 'liveness' && (
                                    <motion.div
                                        initial={{ opacity: 0, scale: 0.8 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        exit={{ opacity: 0, scale: 0.5 }}
                                        className="absolute inset-0 flex flex-col items-center justify-center bg-black/20"
                                    >
                                        <div className="text-4xl mb-2">😄</div>
                                        <div className="text-white font-bold text-sm bg-black/50 px-3 py-1 rounded-full">Sourire Requis</div>
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            {/* Success Overlay */}
                            <AnimatePresence>
                                {loadingState === 'success' && (
                                    <motion.div
                                        initial={{ opacity: 0, scale: 0.8 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        className="absolute inset-0 flex items-center justify-center bg-black/40"
                                    >
                                        <div className="bg-green-500 rounded-full p-4 shadow-lg shadow-green-500/20">
                                            <CheckCircle2 className="w-12 h-12 text-white" />
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            {/* Error Overlay */}
                            {loadingState === 'error' && (
                                <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                                    <div className="text-center p-4">
                                        <AlertCircle className="w-10 h-10 text-red-500 mx-auto mb-2" />
                                        <p className="text-white text-xs font-medium">{error}</p>
                                    </div>
                                </div>
                            )}
                        </div>


                        {/* Orbiting Loading Ring (around the video) */}
                        {loadingState === 'loading' && (
                            <div className="absolute -inset-4 border-4 border-white/10 rounded-[3rem] border-t-blue-500 animate-spin"></div>
                        )}

                        {/* Success Ring Pulse */}
                        {loadingState === 'success' && (
                            <motion.div
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1.1 }}
                                className="absolute -inset-1 border-2 border-green-500 rounded-[2.6rem]"
                            />
                        )}
                    </div>

                    {/* Footer Actions */}
                    <div className="mt-12">
                        <Button
                            variant="ghost"
                            className="text-white/50 hover:text-white hover:bg-white/10 rounded-full px-8"
                            onClick={onClose}
                        >
                            Annuler
                        </Button>
                    </div>
                </div>
            </motion.div>
        </AnimatePresence>
    );
};

export default FaceLogin;
