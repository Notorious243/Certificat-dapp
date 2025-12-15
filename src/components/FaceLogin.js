import React, { useEffect, useRef, useState } from 'react';
import * as faceapi from 'face-api.js';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Lock, Unlock, ScanFace, CheckCircle2, AlertCircle, Eye } from 'lucide-react';
import { Button } from './ui/button';

const FaceLogin = ({ isOpen, onClose, onLogin, adminAccounts }) => {
    const videoRef = useRef(null);
    const [isLoading, setIsLoading] = useState(true);
    const [loadingState, setLoadingState] = useState('initial');
    const [error, setError] = useState(null);
    const [matchFound, setMatchFound] = useState(null);
    const [scanProgress, setScanProgress] = useState(0);
    const [scanMessage, setScanMessage] = useState(null);
    const [failedAttempts, setFailedAttempts] = useState(0); // 3 Max

    const pendingAdminRef = useRef(null);
    const failedAttemptsRef = useRef(0);

    // Euclidean distance helper
    const dist = (p1, p2) => Math.hypot(p1.x - p2.x, p1.y - p2.y);

    // Eye Aspect Ratio (EAR)
    const getEAR = (points) => {
        // points: 0..5 (6 points)
        // 0=left corner, 3=right corner
        // 1,5=top/bottom pair 1
        // 2,4=top/bottom pair 2
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
                setMatchFound(null);
                setScanProgress(0);
                setFailedAttempts(0);
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
                    setError("Erreur système ou accès caméra refusé.");
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
            } catch (err) { console.warn("Skip:", err); }
        }
        return labeledDescriptors;
    };

    const handleFailure = (msg) => {
        failedAttemptsRef.current += 1;
        setFailedAttempts(failedAttemptsRef.current);
        setScanMessage(`${msg} (${failedAttemptsRef.current}/3)`);

        if (failedAttemptsRef.current >= 3) {
            setLoadingState('error');
            setError("Accès Refusé : Nombre maximal de tentatives atteint.");
            setScanMessage("Accès Bloqué 🔒");
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
            if (failedAttemptsRef.current >= 3) return; // Stop if blocked

            try {
                const options = new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 });
                const detections = await faceapi.detectAllFaces(videoRef.current, options)
                    .withFaceLandmarks()
                    .withFaceDescriptors()
                    .withFaceExpressions();

                if (detections.length > 1) {
                    setScanMessage("Une seule personne à la fois !");
                    return;
                }

                if (detections.length > 0) {
                    const detection = detections[0];
                    const match = faceMatcher.findBestMatch(detection.descriptor);
                    const isIdentityValid = match.label !== 'unknown' && !match.label.startsWith('error_');

                    // PHASE 1: INITIAL IDENTITY
                    if (currentPhase === 'scanning') {
                        if (isIdentityValid) {
                            const admin = adminAccounts.find(a => a.username === match.label);
                            if (admin) {
                                pendingAdminRef.current = admin;
                                currentPhase = 'liveness';
                                setMatchFound(match.label);
                                setLoadingState('liveness');
                                setScanProgress(60);
                                setScanMessage("Analyse biométrique..."); // Discreet
                            }
                        }
                    }

                    // PHASE 2: DISCREET LIVENESS (SMILE OR BLINK)
                    else if (currentPhase === 'liveness') {
                        // Anti-Swap Check
                        if (!isIdentityValid || (pendingAdminRef.current && match.label !== pendingAdminRef.current.username)) {
                            if (handleFailure("Identité non reconnue")) {
                                currentPhase = 'blocked';
                            } else {
                                currentPhase = 'scanning'; // Retry
                                setScanProgress(0);
                            }
                            return;
                        }

                        // 1. BLINK DETECTION
                        const leftEye = detection.landmarks.getLeftEye();
                        const rightEye = detection.landmarks.getRightEye();
                        const ear = (getEAR(leftEye) + getEAR(rightEye)) / 2;

                        // EAR < 0.25 usually means closed eyes
                        const isBlinking = ear < 0.25;
                        const now = Date.now();

                        // Check logic: Natural blink is fast (detected once or twice)
                        if (isBlinking && (now - lastBlinkTime > 500)) {
                            lastBlinkTime = now;
                            livenessSequence += 2; // Blinking counts as significant liveness proof
                        }

                        // 2. SMILE DETECTION (Legacy support, but discreet)
                        if (detection.expressions.happy > 0.7) {
                            livenessSequence++;
                        }

                        // SUCCESS THRESHOLD
                        if (livenessSequence > 2) {
                            currentPhase = 'complete';
                            setScanProgress(100);
                            setLoadingState('success');
                            setScanMessage("Vérification terminée");

                            setTimeout(() => {
                                if (pendingAdminRef.current) {
                                    onLogin(pendingAdminRef.current);
                                }
                            }, 800);
                        }
                    }

                } else {
                    // Face Lost logic
                    if (currentPhase === 'liveness') {
                        setScanMessage("Visage perdu...");
                        currentPhase = 'scanning';
                        setScanProgress(0);
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
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xl p-4"
            >
                <div className="relative w-full max-w-sm mx-auto flex flex-col items-center">
                    <div className="mb-8 text-center space-y-2">
                        <motion.div
                            initial={{ y: -20, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            className="inline-flex items-center justify-center p-3 bg-white/10 rounded-full mb-4 backdrop-blur-md"
                        >
                            {loadingState === 'success' ? (
                                <Unlock className="w-8 h-8 text-green-400" />
                            ) : loadingState === 'liveness' ? (
                                <Eye className="w-8 h-8 text-blue-400 animate-pulse" />
                            ) : loadingState === 'error' ? (
                                <Lock className="w-8 h-8 text-red-500" />
                            ) : (
                                <ScanFace className="w-8 h-8 text-white" />
                            )}
                        </motion.div>
                        <h2 className="text-2xl font-semibold text-white tracking-tight">
                            {loadingState === 'success' ? 'Identité Confirmée' :
                                loadingState === 'error' ? 'Accès Refusé' :
                                    'Face ID Sécurisé'}
                        </h2>
                        <p className="text-sm text-white/60 min-h-[1.5rem]">
                            {scanMessage || (
                                <>
                                    {loadingState === 'loading' && 'Initialisation...'}
                                    {loadingState === 'scanning' && 'Regardez la caméra'}
                                    {loadingState === 'liveness' && <span className="text-blue-400 font-medium">Analyse en cours...</span>}
                                    {loadingState === 'success' && `Bienvenue, ${matchFound}`}
                                    {loadingState === 'error' && error}
                                </>
                            )}
                        </p>
                    </div>

                    <div className="relative w-64 h-64">
                        <div className={`absolute inset-0 rounded-[2.5rem] overflow-hidden bg-black border-[3px] shadow-2xl transition-colors duration-500 ${loadingState === 'liveness' ? 'border-blue-400' :
                                loadingState === 'success' ? 'border-green-500' :
                                    loadingState === 'error' ? 'border-red-500' : 'border-white/20'
                            }`}>
                            <video
                                ref={videoRef}
                                muted
                                playsInline
                                className={`w-full h-full object-cover transform scale-125 transition-all duration-700 ${loadingState === 'success' ? 'blur-md scale-100 opacity-50' : ''
                                    }`}
                            />

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
                                        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                                        className="absolute w-full h-1/2 left-0"
                                    />
                                </div>
                            )}

                            {/* Discreet Liveness Indicator (Subtle pulse) */}
                            <AnimatePresence>
                                {loadingState === 'liveness' && (
                                    <motion.div
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                        className="absolute inset-0 border-4 border-blue-500/50 rounded-[2.5rem] animate-pulse"
                                    />
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
                                        <div className="bg-green-500 rounded-full p-4 shadow-lg">
                                            <CheckCircle2 className="w-12 h-12 text-white" />
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            {/* Error Overlay */}
                            {loadingState === 'error' && (
                                <div className="absolute inset-0 flex items-center justify-center bg-black/80 backdrop-blur-sm">
                                    <div className="text-center p-4">
                                        <AlertCircle className="w-10 h-10 text-red-500 mx-auto mb-2" />
                                        <p className="text-white text-xs font-medium">{error}</p>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Processing Ring */}
                        {(loadingState === 'loading' || loadingState === 'liveness') && (
                            <div className="absolute -inset-4 border-4 border-white/10 rounded-[3rem] border-t-blue-500 animate-spin"></div>
                        )}

                        <svg className="absolute -inset-4 w-[calc(100%+2rem)] h-[calc(100%+2rem)] rotate-[-90deg]">
                            <circle
                                cx="50%"
                                cy="50%"
                                r="48%"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="4"
                                className={`transition-all duration-300 ${loadingState === 'success' ? 'text-green-500' :
                                        loadingState === 'error' ? 'text-red-500' : 'text-blue-500'
                                    }`}
                                strokeDasharray="100 100"
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
