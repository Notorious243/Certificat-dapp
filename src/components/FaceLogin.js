import React, { useEffect, useRef, useState } from 'react';
import * as faceapi from 'face-api.js';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Lock, Unlock, Eye, AlertCircle, ScanFace } from 'lucide-react';
import { Button } from './ui/button';

const FaceLogin = ({ isOpen, onClose, onLogin, adminAccounts }) => {
    const videoRef = useRef(null);
    const streamRef = useRef(null); // Fix: Store stream explicitly

    const [isLoading, setIsLoading] = useState(true);
    const [loadingState, setLoadingState] = useState('initial');
    const [scanMessage, setScanMessage] = useState(null);

    // Logic refs
    const pendingAdminRef = useRef(null);
    const failedAttemptsRef = useRef(0);
    const startTimeRef = useRef(0);

    // Process refs
    const detectionIntervalRef = useRef(null);
    const faceMatcherRef = useRef(null);
    const cleanupTimeoutRef = useRef(null);

    // Euclidean distance helper
    const dist = (p1, p2) => Math.hypot(p1.x - p2.x, p1.y - p2.y);

    // Eye Aspect Ratio (EAR)
    const getEAR = (points) => {
        const A = dist(points[1], points[5]);
        const B = dist(points[2], points[4]);
        const C = dist(points[0], points[3]);
        return (A + B) / (2.0 * C);
    };

    // Global Cleanup
    const stopWebcam = () => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
        if (videoRef.current) {
            videoRef.current.srcObject = null;
        }
        if (detectionIntervalRef.current) clearInterval(detectionIntervalRef.current);
        if (cleanupTimeoutRef.current) clearTimeout(cleanupTimeoutRef.current);
    };

    // Initialisation
    useEffect(() => {
        let isMounted = true;

        const loadModelsAndStart = async () => {
            if (!isOpen) return;

            try {
                setIsLoading(true);
                setLoadingState('loading');
                setScanMessage(null);
                failedAttemptsRef.current = 0;
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
                if (labeledDescriptors.length === 0) throw new Error("Aucun administrateur n'a configuré Face ID.");

                const faceMatcher = new faceapi.FaceMatcher(labeledDescriptors, 0.4);
                faceMatcherRef.current = faceMatcher;

                // 3. Démarrer la webcam (Robust Mobile Fallback)
                let stream;
                try {
                    stream = await navigator.mediaDevices.getUserMedia({
                        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }
                    });
                } catch (err) {
                    console.log("Ideal constraints failed, trying basic...", err);
                    try {
                        stream = await navigator.mediaDevices.getUserMedia({
                            video: { facingMode: 'user' }
                        });
                    } catch (err2) {
                        console.log("Basic constraints failed, trying fallback...", err2);
                        stream = await navigator.mediaDevices.getUserMedia({ video: true });
                    }
                }

                streamRef.current = stream; // Keep reference!

                if (videoRef.current && isMounted) {
                    videoRef.current.srcObject = stream;
                    // Ensure playsInline is active (React prop handles it but explicit sometimes helps)
                    videoRef.current.setAttribute('playsinline', 'true');
                    videoRef.current.onloadedmetadata = () => {
                        videoRef.current.play().catch(e => console.error("Play error:", e));
                        setIsLoading(false);
                        setLoadingState('scanning');
                        startAttempt();
                    };
                }

            } catch (err) {
                console.error("FaceLogin Error:", err);
                if (isMounted) {
                    setLoadingState('error');
                    if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                        setScanMessage("Accès caméra refusé");
                    } else {
                        setScanMessage("Erreur Système");
                    }
                    setTimeout(() => shutdown(), 3000);
                }
                setIsLoading(false);
            }
        };

        if (isOpen) {
            loadModelsAndStart();
        }

        return () => {
            isMounted = false;
            stopWebcam();
        };
    }, [isOpen, adminAccounts]);

    const shutdown = () => {
        stopWebcam();
        onClose();
    };

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

    const startAttempt = () => {
        if (!faceMatcherRef.current) return;
        setLoadingState('scanning');
        setScanMessage(null); // No text, just vibe
        if (detectionIntervalRef.current) clearInterval(detectionIntervalRef.current);
        detectionIntervalRef.current = startDetection(faceMatcherRef.current);
    };

    const handleStrictFailure = (reason) => {
        failedAttemptsRef.current += 1;

        // VISUAL FAIL EFFECT (RED SHAKE)
        setLoadingState('failure_moment');
        setScanMessage("Non reconnu");

        if (failedAttemptsRef.current >= 3) {
            // FINAL LOCKOUT
            setTimeout(() => {
                setLoadingState('locked');
                setScanMessage("Accès Refusé");
                setTimeout(shutdown, 2000);
            }, 1000); // Wait for red flash
            return true;
        } else {
            // AUTO RETRY
            cleanupTimeoutRef.current = setTimeout(() => {
                startAttempt(); // Restart automatically
            }, 1500); // 1.5s delay before retry
            return false;
        }
    };

    const startDetection = (faceMatcher) => {
        let currentPhase = 'scanning';
        let livenessSequence = 0;
        let lastBlinkTime = 0;
        startTimeRef.current = Date.now();

        return setInterval(async () => {
            if (!videoRef.current || !isOpen) return;

            // 2-SECOND TIMEOUT CHECK
            const elapsed = Date.now() - startTimeRef.current;
            if (elapsed > 2000 && currentPhase === 'scanning') {
                clearInterval(detectionIntervalRef.current);
                handleStrictFailure("Temps écoulé");
                return;
            }

            try {
                const options = new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 });
                const detections = await faceapi.detectAllFaces(videoRef.current, options)
                    .withFaceLandmarks()
                    .withFaceDescriptors()
                    .withFaceExpressions();

                if (detections.length > 1) {
                    return; // Ignore crowd
                }

                if (detections.length > 0) {
                    const detection = detections[0];
                    const match = faceMatcher.findBestMatch(detection.descriptor);
                    const isIdentityValid = match.label !== 'unknown' && !match.label.startsWith('error_');

                    if (currentPhase === 'scanning') {
                        if (isIdentityValid) {
                            const admin = adminAccounts.find(a => a.username === match.label);
                            if (admin) {
                                pendingAdminRef.current = admin;
                                currentPhase = 'liveness';
                                // Silent, swift transition
                            }
                        }
                    }
                    else if (currentPhase === 'liveness') {
                        if (!isIdentityValid || (pendingAdminRef.current && match.label !== pendingAdminRef.current.username)) {
                            clearInterval(detectionIntervalRef.current);
                            handleStrictFailure("Identité perdue");
                            return;
                        }

                        // Blink
                        const leftEye = detection.landmarks.getLeftEye();
                        const rightEye = detection.landmarks.getRightEye();
                        const ear = (getEAR(leftEye) + getEAR(rightEye)) / 2;
                        if (ear < 0.25 && (Date.now() - lastBlinkTime > 500)) {
                            lastBlinkTime = Date.now();
                            livenessSequence += 2;
                        }
                        // Smile (Keep strictly as optional fallback)
                        if (detection.expressions.happy > 0.7) livenessSequence++;

                        // SUCCESS
                        if (livenessSequence > 2) {
                            clearInterval(detectionIntervalRef.current);
                            setLoadingState('success');
                            stopWebcam(); // Immediate cleanup

                            setTimeout(() => {
                                if (pendingAdminRef.current) onLogin(pendingAdminRef.current);
                            }, 1000); // Show green success for 1s
                        }
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
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-xl p-4"
            >
                <div className="relative w-full max-w-sm mx-auto flex flex-col items-center">

                    {/* Abstract Header - Dynamic Icon */}
                    <div className="mb-8 text-center h-12 flex flex-col justify-center items-center">
                        <AnimatePresence mode='wait'>
                            {loadingState === 'success' ? (
                                <motion.div key="unlock" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}>
                                    <Unlock className="w-8 h-8 text-green-500" />
                                </motion.div>
                            ) : loadingState === 'locked' ? (
                                <motion.div key="lock" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}>
                                    <Lock className="w-8 h-8 text-red-500" />
                                </motion.div>
                            ) : (
                                <motion.div key="scan" animate={{ opacity: [0.5, 1, 0.5] }} transition={{ duration: 2, repeat: Infinity }}>
                                    <ScanFace className="w-8 h-8 text-white/50" />
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* "WOW" CONTAINER */}
                    <motion.div
                        className="relative w-56 h-56 rounded-full flex items-center justify-center"
                        animate={
                            loadingState === 'failure_moment' ? { x: [-10, 10, -10, 10, 0], borderColor: '#ef4444' } :
                                loadingState === 'locked' ? { scale: 0.9, borderColor: '#ef4444' } :
                                    {}
                        }
                        transition={{ duration: 0.4 }}
                    >
                        {/* HOLOGRAPHIC PULSE (Scanning only) */}
                        {['scanning', 'liveness'].includes(loadingState) && (
                            <>
                                <motion.div
                                    className="absolute inset-0 rounded-full border border-white/20"
                                    animate={{ scale: [1, 1.1, 1], opacity: [0.1, 0.3, 0.1] }}
                                    transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                                />
                                <motion.div
                                    className="absolute inset-0 rounded-full border border-white/10"
                                    animate={{ scale: [1.1, 1.2, 1.1], opacity: [0, 0.1, 0] }}
                                    transition={{ duration: 2, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
                                />
                            </>
                        )}

                        {/* RED GLITCH RING (Failure) */}
                        {loadingState === 'failure_moment' && (
                            <motion.div
                                className="absolute inset-0 rounded-full border-4 border-red-500/50"
                                initial={{ opacity: 0, scale: 1.1 }}
                                animate={{ opacity: [0, 1, 0], scale: 1.2 }}
                                transition={{ duration: 0.5 }}
                            />
                        )}

                        {/* SUCCESS RING */}
                        {loadingState === 'success' && (
                            <motion.div
                                className="absolute inset-0 rounded-full border-4 border-green-500"
                                initial={{ scale: 1 }}
                                animate={{ scale: [1, 1.05, 1], boxShadow: "0 0 20px rgba(34, 197, 94, 0.5)" }}
                                transition={{ duration: 0.5 }}
                            />
                        )}

                        {/* VIDEO ELEMENT (Clean) */}
                        <div className="w-48 h-48 rounded-full overflow-hidden relative z-10 bg-black shadow-2xl">
                            <video
                                ref={videoRef}
                                muted
                                playsInline
                                className={`w-full h-full object-cover transform scale-125 transition-transform duration-700 ${loadingState === 'success' ? 'grayscale-0' : 'grayscale-[20%]'
                                    }`}
                            />
                        </div>
                    </motion.div>

                    {/* STATUS MESSAGE (Minimalist) */}
                    <div className="mt-8 h-8">
                        <AnimatePresence mode='wait'>
                            {scanMessage && (
                                <motion.p
                                    key={scanMessage}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -10 }}
                                    className={`text-sm font-medium tracking-wide ${loadingState === 'failure_moment' || loadingState === 'locked' ? 'text-red-400' :
                                        loadingState === 'success' ? 'text-green-400' :
                                            'text-white/50'
                                        }`}
                                >
                                    {scanMessage}
                                </motion.p>
                            )}
                        </AnimatePresence>
                    </div>

                    <div className="mt-8">
                        <Button variant="ghost" size="sm" className="text-white/20 hover:text-white hover:bg-white/10 transition-colors" onClick={shutdown}>
                            Fermer
                        </Button>
                    </div>
                </div>
            </motion.div>
        </AnimatePresence>
    );
};

export default FaceLogin;
