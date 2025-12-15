import React, { useEffect, useRef, useState } from 'react';
import * as faceapi from 'face-api.js';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Lock, Unlock, Eye, AlertCircle } from 'lucide-react';
import { Button } from './ui/button';

const FaceLogin = ({ isOpen, onClose, onLogin, adminAccounts }) => {
    const videoRef = useRef(null);
    const [isLoading, setIsLoading] = useState(true);
    const [loadingState, setLoadingState] = useState('initial');
    const [error, setError] = useState(null);
    const [scanMessage, setScanMessage] = useState(null);

    // Logic refs
    const pendingAdminRef = useRef(null);
    const failedAttemptsRef = useRef(0);
    const unknownFaceTimerRef = useRef(0); // Counts frames of unknown face

    // Euclidean distance helper
    const dist = (p1, p2) => Math.hypot(p1.x - p2.x, p1.y - p2.y);

    // Eye Aspect Ratio (EAR)
    const getEAR = (points) => {
        const A = dist(points[1], points[5]);
        const B = dist(points[2], points[4]);
        const C = dist(points[0], points[3]);
        return (A + B) / (2.0 * C);
    };

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
                failedAttemptsRef.current = 0;
                unknownFaceTimerRef.current = 0;
                pendingAdminRef.current = null;

                // 1. Charger les modèles
                await Promise.all([
                    faceapi.nets.ssdMobilenetv1.loadFromUri('/models'),
                    faceapi.nets.faceLandmark68Net.loadFromUri('/models'),
                    faceapi.nets.faceRecognitionNet.loadFromUri('/models'),
                    faceapi.nets.faceExpressionNet.loadFromUri('/models')
                ]);

                // 2. Préparer les visages
                const labeledDescriptors = await loadLabeledImages();

                if (labeledDescriptors.length === 0) {
                    throw new Error("Aucun administrateur n'a configuré Face ID.");
                }

                // SECURITY BOOST: Threshold 0.4 
                const faceMatcher = new faceapi.FaceMatcher(labeledDescriptors, 0.4);

                // 3. Démarrer la webcam
                const constraints = {
                    video: {
                        facingMode: 'user',
                        width: { ideal: 640 },
                        height: { ideal: 480 }
                    }
                };

                const stream = await navigator.mediaDevices.getUserMedia(constraints);

                if (videoRef.current && isMounted) {
                    videoRef.current.srcObject = stream;
                    videoRef.current.onloadedmetadata = () => {
                        videoRef.current.play().catch(e => console.error("Play error:", e));
                        setIsLoading(false);
                        setLoadingState('scanning');
                        detectionInterval = startDetection(faceMatcher);
                    };
                }

            } catch (err) {
                console.error("FaceLogin Error:", err);
                if (isMounted) {
                    setError("Erreur système.");
                    setLoadingState('error');
                    setTimeout(onClose, 2000); // Auto close on system error
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
        const activeAdmins = adminAccounts.filter(a => a.status === 'Active' && a.faceIdConfigured && a.faceIdData);

        for (const admin of activeAdmins) {
            try {
                if (admin.faceIdData) {
                    const img = new Image();
                    img.crossOrigin = "anonymous";
                    img.src = admin.faceIdData;
                    await new Promise((resolve) => { img.onload = resolve; });

                    const detections = await faceapi.detectSingleFace(img, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
                        .withFaceLandmarks()
                        .withFaceDescriptor();

                    if (detections) {
                        labeledDescriptors.push(new faceapi.LabeledFaceDescriptors(admin.username, [detections.descriptor]));
                    }
                }
            } catch (err) { }
        }
        return labeledDescriptors;
    };

    const handleStrictFailure = (reason) => {
        failedAttemptsRef.current += 1;
        setScanMessage(`Non reconnu (${failedAttemptsRef.current}/3)`); // Minimal feedback

        if (failedAttemptsRef.current >= 3) {
            setLoadingState('error');
            setError("Accès Bloqué. Fermeture...");

            // STRICT LOCKOUT: Close modal
            setTimeout(() => {
                onClose();
            }, 1500);
            return true; // blocked
        }
        return false;
    };

    const startDetection = (faceMatcher) => {
        let currentPhase = 'scanning';
        let livenessSequence = 0;
        let lastBlinkTime = 0;

        return setInterval(async () => {
            if (!videoRef.current || !isOpen) return;
            if (failedAttemptsRef.current >= 3) return; // Blocked

            try {
                const options = new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 });
                const detections = await faceapi.detectAllFaces(videoRef.current, options)
                    .withFaceLandmarks()
                    .withFaceDescriptors()
                    .withFaceExpressions();

                if (detections.length > 1) {
                    setScanMessage("Une seule personne !");
                    return;
                }

                if (detections.length > 0) {
                    const detection = detections[0];
                    const match = faceMatcher.findBestMatch(detection.descriptor);
                    const isIdentityValid = match.label !== 'unknown' && !match.label.startsWith('error_');

                    // PHASE 1: INITIAL IDENTITY SCAN
                    if (currentPhase === 'scanning') {
                        if (isIdentityValid) {
                            // Identity Found -> Move to Liveness
                            const admin = adminAccounts.find(a => a.username === match.label);
                            if (admin) {
                                pendingAdminRef.current = admin;
                                currentPhase = 'liveness';
                                setLoadingState('liveness');
                                setScanMessage("Vérification...");
                                unknownFaceTimerRef.current = 0; // Reset timer
                            }
                        } else {
                            // Identity UNKNOWN -> Count duration
                            unknownFaceTimerRef.current += 1;
                            // If unknown for > 10 frames (~2 seconds) -> STRIKE 1
                            if (unknownFaceTimerRef.current > 10) {
                                unknownFaceTimerRef.current = 0;
                                if (handleStrictFailure("Visage inconnu")) {
                                    return; // Locked out
                                }
                            }
                        }
                    }

                    // PHASE 2: DISCREET LIVENESS (SMILE OR BLINK)
                    else if (currentPhase === 'liveness') {
                        // Anti-Swap Check
                        if (!isIdentityValid || (pendingAdminRef.current && match.label !== pendingAdminRef.current.username)) {
                            // IMMEDIATE SECURITY FAIL
                            if (handleStrictFailure("Identité perdue")) {
                                return;
                            }
                            currentPhase = 'scanning';
                            return;
                        }

                        // 1. BLINK DETECTION
                        const leftEye = detection.landmarks.getLeftEye();
                        const rightEye = detection.landmarks.getRightEye();
                        const ear = (getEAR(leftEye) + getEAR(rightEye)) / 2;

                        const isBlinking = ear < 0.25;
                        const now = Date.now();

                        if (isBlinking && (now - lastBlinkTime > 500)) {
                            lastBlinkTime = now;
                            livenessSequence += 2;
                        }

                        // 2. SMILE (Optional/Discreet)
                        if (detection.expressions.happy > 0.7) {
                            livenessSequence++;
                        }

                        // SUCCESS
                        if (livenessSequence > 2) {
                            currentPhase = 'complete';
                            setLoadingState('success');
                            setScanMessage("Confirmé");

                            setTimeout(() => {
                                if (pendingAdminRef.current) {
                                    onLogin(pendingAdminRef.current);
                                }
                            }, 800);
                        }
                    }

                } else {
                    // No Face Found
                    if (currentPhase === 'liveness') {
                        setScanMessage("...");
                        currentPhase = 'scanning';
                    }
                }
            } catch (err) { }
        }, 200);
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
            >
                <div className="relative w-full max-w-sm mx-auto flex flex-col items-center">

                    {/* Minimalist Header */}
                    <div className="mb-6 text-center">
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            className="inline-flex items-center justify-center mb-2"
                        >
                            {loadingState === 'success' ? (
                                <Unlock className="w-6 h-6 text-green-500" />
                            ) : loadingState === 'error' ? (
                                <Lock className="w-6 h-6 text-red-500" />
                            ) : (
                                <Eye className="w-6 h-6 text-white/50" />
                            )}
                        </motion.div>
                        <p className="text-sm text-white/70 font-medium">
                            {scanMessage || (
                                <>
                                    {loadingState === 'loading' && 'Initialisation...'}
                                    {loadingState === 'scanning' && 'Authentification requise'}
                                    {loadingState === 'liveness' && 'Analyse...'}
                                    {loadingState === 'success' && 'Succès'}
                                    {loadingState === 'error' && error}
                                </>
                            )}
                        </p>
                    </div>

                    {/* ULTRA DISCREET VIDEO CONTAINER */}
                    {/* No scan lines, no rings, just the video with subtle border feedback */}
                    <div className="relative w-48 h-48 rounded-full overflow-hidden shadow-2xl transition-all duration-500">
                        {/* Status Border */}
                        <div className={`absolute inset-0 z-10 border-[4px] rounded-full transition-colors duration-300 ${loadingState === 'liveness' ? 'border-blue-500/50' :
                                loadingState === 'success' ? 'border-green-500' :
                                    loadingState === 'error' ? 'border-red-500' : 'border-white/10'
                            }`}></div>

                        <video
                            ref={videoRef}
                            muted
                            playsInline
                            className="w-full h-full object-cover transform scale-125 hover:scale-130 transition-transform duration-700"
                        />

                        {/* Success Overlay */}
                        <AnimatePresence>
                            {loadingState === 'success' && (
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    className="absolute inset-0 z-20 flex items-center justify-center bg-black/40"
                                >
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* Error Overlay */}
                        <AnimatePresence>
                            {loadingState === 'error' && (
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    className="absolute inset-0 z-20 flex items-center justify-center bg-black/60"
                                >
                                    <AlertCircle className="w-8 h-8 text-red-500" />
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    <div className="mt-8">
                        <Button variant="ghost" size="sm" className="text-white/30 hover:text-white hover:bg-white/10" onClick={onClose}>
                            <X className="w-4 h-4 mr-2" />
                            Annuler
                        </Button>
                    </div>
                </div>
            </motion.div>
        </AnimatePresence>
    );
};

export default FaceLogin;
