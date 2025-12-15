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
    const [scanMessage, setScanMessage] = useState(null);
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
                setScanMessage(null);
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
        let currentPhase = 'scanning';
        let livenessSequence = 0; // To track sustained smile

        return setInterval(async () => {
            if (!videoRef.current || !isOpen) return;
            if (videoRef.current.readyState !== 4) return;

            try {
                // Détection visage + EXPRESSIONS
                const options = new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 });

                const detections = await faceapi.detectAllFaces(videoRef.current, options)
                    .withFaceLandmarks()
                    .withFaceDescriptors()
                    .withFaceExpressions();

                // SECURITY: REJECT MULTIPLE FACES
                if (detections.length > 1) {
                    setScanMessage("Une seule personne à la fois ! ⚠️");
                    setLoadingState('error');
                    setScanProgress(0);
                    return;
                }

                if (detections.length > 0) {
                    const detection = detections[0];

                    // CONTINUOUS IDENTITY CHECK (Every Frame)
                    const match = faceMatcher.findBestMatch(detection.descriptor);
                    const isIdentityValid = match.label !== 'unknown' && !match.label.startsWith('error_');

                    // PHASE 1: INITIAL IDENTITY SCAN
                    if (currentPhase === 'scanning') {
                        if (isIdentityValid) {
                            const admin = adminAccounts.find(a => a.username === match.label);
                            if (admin) {
                                pendingAdminRef.current = admin;
                                currentPhase = 'liveness';
                                setMatchFound(match.label);
                                setLoadingState('liveness');
                                setLivenessStep('smile');
                                setScanProgress(75);
                            }
                        } else {
                            setScanProgress(prev => Math.min(prev + 2, 60)); // Cap progress if face detected but not recognized
                        }
                    }

                    // PHASE 2: LIVENESS CHECK (SMILE)
                    else if (currentPhase === 'liveness') {
                        // CRITICAL SECURITY: RE-VERIFY IDENTITY
                        // If the person changed (Swap Attack), ABORT IMMEDIATELY
                        if (!isIdentityValid || (pendingAdminRef.current && match.label !== pendingAdminRef.current.username)) {
                            console.warn("Security Alert: Face Swapped or Identity Lost during Liveness Check");
                            setScanMessage("Identité non reconnue ! ⛔");
                            setLoadingState('error');
                            currentPhase = 'scanning'; // Reset
                            setScanProgress(0);
                            return;
                        }

                        // Check Smile
                        if (detection.expressions.happy > 0.7) {
                            livenessSequence++;

                            // Require sustained smile (3 frames ~ 600ms) to prevent glitching
                            if (livenessSequence > 2) {
                                // SUCCESS !!
                                currentPhase = 'complete';
                                setScanProgress(100);
                                setLoadingState('success');

                                setTimeout(() => {
                                    if (pendingAdminRef.current) {
                                        onLogin(pendingAdminRef.current);
                                    }
                                }, 1000);
                            }
                        } else {
                            livenessSequence = 0; // Reset if smile drops
                        }
                    }

                } else {
                    // No face found
                    if (currentPhase === 'liveness') {
                        // Lost face during liveness -> Reset security
                        setScanMessage("Visage perdu. Recommencez.");
                        currentPhase = 'scanning';
                        setLoadingState('scanning');
                        setScanProgress(0);
                    } else {
                        setScanProgress(prev => Math.max(prev - 2, 0));
                    }
                }
            } catch (err) {
                // Ignore transient
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
                            {scanMessage ? (
                                <span className={loadingState === 'error' ? "text-red-400 font-bold" : "text-yellow-400 font-bold"}>
                                    {scanMessage}
                                </span>
                            ) : (
                                <>
                                    {loadingState === 'loading' && 'Initialisation IA...'}
                                    {loadingState === 'scanning' && 'Positionnez votre visage'}
                                    {loadingState === 'liveness' && <span className="text-yellow-400 font-bold text-lg">Souriez pour confirmer ! 😄</span>}
                                    {loadingState === 'success' && `Bienvenue, ${matchFound}`}
                                    {loadingState === 'error' && error}
                                </>
                            )}
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

                        {/* Progress Ring (SVG) */}
                        <svg className="absolute -inset-4 w-[calc(100%+2rem)] h-[calc(100%+2rem)] rotate-[-90deg]">
                            <circle
                                cx="50%"
                                cy="50%"
                                r="48%"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="4"
                                className={`transition-all duration-300 ${loadingState === 'success' ? 'text-green-500' : 'text-blue-500'
                                    }`}
                                strokeDasharray="100 100" // Approximatif
                                strokeDashoffset={100 - scanProgress}
                                pathLength="100"
                                strokeLinecap="round"
                            />
                        </svg>
                    </div>

                    <div className="mt-8">
                        <Button variant="ghost" className="text-white/40 hover:text-white" onClick={onClose}>
                            <X className="w-5 h-5 mr-2" />
                            Annuler
                        </Button>
                    </div>
                </div>
            </motion.div>
        </AnimatePresence>
    );
};

export default FaceLogin;
