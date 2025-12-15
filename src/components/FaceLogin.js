import React, { useEffect, useRef, useState } from 'react';
import * as faceapi from 'face-api.js';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Lock, Unlock, Eye, AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from './ui/button';

const FaceLogin = ({ isOpen, onClose, onLogin, adminAccounts }) => {
    const videoRef = useRef(null);
    const [isLoading, setIsLoading] = useState(true);
    const [loadingState, setLoadingState] = useState('initial');
    const [error, setError] = useState(null);
    const [scanMessage, setScanMessage] = useState(null);
    const [canRetry, setCanRetry] = useState(false);

    const pendingAdminRef = useRef(null);
    const failedAttemptsRef = useRef(0);
    const startTimeRef = useRef(0);
    const detectionIntervalRef = useRef(null);
    const faceMatcherRef = useRef(null); // Store matcher for retries

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

        const cleanup = () => {
            if (detectionIntervalRef.current) clearInterval(detectionIntervalRef.current);
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
                setCanRetry(false);
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

                if (labeledDescriptors.length === 0) {
                    throw new Error("Aucun administrateur n'a configuré Face ID.");
                }

                const faceMatcher = new faceapi.FaceMatcher(labeledDescriptors, 0.4);
                faceMatcherRef.current = faceMatcher; // Store for retries

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
                        startAttempt(); // Start Attempt 1
                    };
                }

            } catch (err) {
                console.error("FaceLogin Error:", err);
                if (isMounted) {
                    setError("Erreur système.");
                    setLoadingState('error');
                    setTimeout(onClose, 2000);
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

    const startAttempt = () => {
        if (!faceMatcherRef.current) return;
        setCanRetry(false);
        setLoadingState('scanning');
        setScanMessage('Analyse...');
        if (detectionIntervalRef.current) clearInterval(detectionIntervalRef.current);
        detectionIntervalRef.current = startDetection(faceMatcherRef.current);
    };

    const handleStrictFailure = (reason) => {
        failedAttemptsRef.current += 1;

        if (failedAttemptsRef.current >= 3) {
            setLoadingState('error');
            setScanMessage("Accès Bloqué. Fermeture...");
            setTimeout(() => { onClose(); }, 1500);
            return true; // blocked
        }

        // Retry Mode
        setLoadingState('error');
        setScanMessage(`Non reconnu (${failedAttemptsRef.current}/3)`);
        setCanRetry(true);
        return false;
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
                    setScanMessage("Une seule personne !");
                    return;
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
                                setLoadingState('liveness');
                                setScanMessage("Confirmation...");
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
                        const isBlinking = ear < 0.25;
                        const now = Date.now();
                        if (isBlinking && (now - lastBlinkTime > 500)) livenessSequence += 2;

                        // Smile
                        if (detection.expressions.happy > 0.7) livenessSequence++;

                        // SUCCESS
                        if (livenessSequence > 2) {
                            clearInterval(detectionIntervalRef.current);
                            currentPhase = 'complete';
                            setLoadingState('success');
                            setScanMessage("Succès");
                            setTimeout(() => {
                                if (pendingAdminRef.current) onLogin(pendingAdminRef.current);
                            }, 800);
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
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
            >
                <div className="relative w-full max-w-sm mx-auto flex flex-col items-center">

                    <div className="mb-6 text-center h-16 flex flex-col justify-center">
                        <p className="text-sm text-white/70 font-medium">
                            {scanMessage || (
                                <>
                                    {loadingState === 'loading' && 'Initialisation...'}
                                    {loadingState === 'scanning' && 'Initialisation...'}
                                    {loadingState === 'liveness' && 'Vérification...'}
                                    {loadingState === 'success' && 'Succès'}
                                </>
                            )}
                        </p>
                    </div>

                    <div className="relative w-48 h-48 rounded-full overflow-hidden shadow-2xl transition-all duration-500 bg-black">
                        {/* Status Border */}
                        <div className={`absolute inset-0 z-10 border-[3px] rounded-full transition-colors duration-300 ${loadingState === 'success' ? 'border-green-500' :
                                loadingState === 'error' && !canRetry ? 'border-red-500' :
                                    'border-white/10'
                            }`}></div>

                        <video
                            ref={videoRef}
                            muted
                            playsInline
                            className="w-full h-full object-cover transform scale-125 transition-transform duration-700"
                        />

                        <AnimatePresence>
                            {canRetry && (
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 backdrop-blur-sm"
                                >
                                    <Button
                                        onClick={startAttempt}
                                        variant="outline"
                                        className="rounded-full h-12 w-12 p-0 border-white/20 bg-white/10 hover:bg-white/20 text-white"
                                    >
                                        <RefreshCw className="w-5 h-5" />
                                    </Button>
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
