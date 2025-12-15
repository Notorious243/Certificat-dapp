import React, { useEffect, useRef, useState } from 'react';
import * as faceapi from 'face-api.js';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Lock, Unlock, ScanFace, CheckCircle2, AlertCircle } from 'lucide-react';
import { Button } from './ui/button';

const FaceLogin = ({ isOpen, onClose, onLogin, adminAccounts }) => {
    const videoRef = useRef(null);
    const [isLoading, setIsLoading] = useState(true);
    const [loadingState, setLoadingState] = useState('initial'); // initial, loading, ready, scanning, success, error
    const [error, setError] = useState(null);
    const [matchFound, setMatchFound] = useState(null);
    const [scanProgress, setScanProgress] = useState(0);

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

                // 1. Charger les modèles
                await Promise.all([
                    faceapi.nets.ssdMobilenetv1.loadFromUri('/models'),
                    faceapi.nets.faceLandmark68.loadFromUri('/models'),
                    faceapi.nets.faceRecognitionNet.loadFromUri('/models')
                ]);

                // 2. Préparer les visages de référence (Admins)
                const labeledDescriptors = await loadLabeledImages();
                const faceMatcher = new faceapi.FaceMatcher(labeledDescriptors, 0.6);

                // 3. Démarrer la webcam
                const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });

                if (videoRef.current && isMounted) {
                    videoRef.current.srcObject = stream;

                    // Attendre que la vidéo joue pour démarrer la détection
                    videoRef.current.onloadedmetadata = () => {
                        videoRef.current.play();
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
                    } else {
                        setError("Erreur technique: " + (err.message || "Inconnue"));
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
        return Promise.all(
            adminAccounts.map(async (admin) => {
                try {
                    // Si photo locale (blob/base64) ou url
                    const img = await faceapi.fetchImage(admin.photo);
                    const detections = await faceapi.detectSingleFace(img).withFaceLandmarks().withFaceDescriptor();

                    if (!detections) {
                        throw new Error(`Pas de visage trouvé pour ${admin.firstName}`);
                    }
                    return new faceapi.LabeledFaceDescriptors(admin.username, [detections.descriptor]);
                } catch (err) {
                    console.warn(`Skip admin ${admin.firstName}:`, err);
                    // Retourner un descripteur "impossible" pour ne pas faire échouer Promise.all
                    return new faceapi.LabeledFaceDescriptors(`error_${admin.username}`, [new Float32Array(128)]);
                }
            })
        );
    };

    const startDetection = (faceMatcher) => {
        return setInterval(async () => {
            if (!videoRef.current || !isOpen) return;

            // Détection visage
            const detections = await faceapi.detectAllFaces(videoRef.current)
                .withFaceLandmarks()
                .withFaceDescriptors();

            if (detections.length > 0) {
                // S'il y a un visage, on augmente "la confiance" visuelle (progress bar)
                setScanProgress(prev => Math.min(prev + 5, 100));

                const results = detections.map(d => faceMatcher.findBestMatch(d.descriptor));

                // On cherche un match valide
                const match = results.find(result =>
                    result.label !== 'unknown' && !result.label.startsWith('error_')
                );

                if (match) {
                    // MATCH TROUVÉ !
                    setMatchFound(match.label);
                    setLoadingState('success');
                    setScanProgress(100);

                    // Trouver l'objet admin complet
                    const admin = adminAccounts.find(a => a.username === match.label);

                    // Delay pour l'animation de succès
                    setTimeout(() => {
                        onLogin(admin);
                    }, 1200);
                }
            } else {
                // Pas de visage, on baisse la progress
                setScanProgress(prev => Math.max(prev - 2, 0));
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
                            ) : (
                                <Lock className="w-8 h-8 text-white" />
                            )}
                        </motion.div>
                        <h2 className="text-2xl font-semibold text-white tracking-tight">
                            {loadingState === 'success' ? 'Identité confirmée' : 'Face ID'}
                        </h2>
                        <p className="text-sm text-white/60">
                            {loadingState === 'loading' && 'Initialisation...'}
                            {loadingState === 'scanning' && 'Positionnez votre visage'}
                            {loadingState === 'success' && `Bienvenue, ${matchFound}`}
                            {loadingState === 'error' && 'Authentification échouée'}
                        </p>
                    </div>

                    {/* Main Scanner UI (Apple Style) */}
                    <div className="relative w-64 h-64">
                        {/* Container Shape */}
                        <div className="absolute inset-0 rounded-[2.5rem] overflow-hidden bg-black border-[3px] border-white/20 shadow-2xl">
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
