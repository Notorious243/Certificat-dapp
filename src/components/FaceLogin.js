import React, { useState, useEffect, useRef } from 'react';
import * as faceapi from 'face-api.js';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from './ui/button';
import { Lock, Unlock, ScanFace } from 'lucide-react';
import { db } from '../firebase';
import { collection, getDocs } from 'firebase/firestore';


const FaceLogin = ({ isOpen, onClose, onLogin }) => { // Remove adminAccounts prop
    const videoRef = useRef(null);
    const streamRef = useRef(null); // Fix: Store stream explicitly

    const [isLoading, setIsLoading] = useState(true);
    const [loadingState, setLoadingState] = useState('initial');
    const [scanMessage, setScanMessage] = useState(null);

    // Logic refs
    const pendingAdminRef = useRef(null);
    const failedAttemptsRef = useRef(0);
    const startTimeRef = useRef(0);
    const activeAdminsRef = useRef([]); // Store fetched admins here

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

                // PARALLEL INIT: CAMERA + MODELS + FIRESTORE
                const [stream, _] = await Promise.all([
                    // 1. Démarrer la webcam (Simple & Direct for Mobile Permission)
                    navigator.mediaDevices.getUserMedia({
                        video: { facingMode: 'user' } // Simple constraint
                    }).catch(err => { throw err; }),

                    // 2. Charger les modèles
                    faceapi.nets.ssdMobilenetv1.loadFromUri('/models'),
                    faceapi.nets.faceLandmark68Net.loadFromUri('/models'),
                    faceapi.nets.faceRecognitionNet.loadFromUri('/models'),
                    faceapi.nets.faceExpressionNet.loadFromUri('/models')
                ]);

                // 3. Setup Stream
                streamRef.current = stream;
                if (videoRef.current && isMounted) {
                    videoRef.current.srcObject = stream;
                    videoRef.current.setAttribute('playsinline', 'true');
                    videoRef.current.onloadedmetadata = () => {
                        videoRef.current.play().catch(e => console.error("Play error:", e));
                    };
                }

                // 4. Fetch Admins from Firebase & Prepare Faces
                setScanMessage("Chargement...");

                // Fetch from Firestore
                const querySnapshot = await getDocs(collection(db, "admins"));
                const fetchedAdmins = querySnapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));
                activeAdminsRef.current = fetchedAdmins; // Store for matching later

                const labeledDescriptors = await processLabeledImages(fetchedAdmins);
                if (labeledDescriptors.length === 0) throw new Error("Aucun administrateur (avec Face ID) trouvé sur le Cloud.");

                const faceMatcher = new faceapi.FaceMatcher(labeledDescriptors, 0.6);
                faceMatcherRef.current = faceMatcher;

                if (isMounted) {
                    setIsLoading(false);
                    setLoadingState('scanning');
                    startAttempt();
                }

            } catch (err) {
                console.error("FaceLogin Error:", err);
                if (isMounted) {
                    setLoadingState('error');
                    let msg = "Erreur Système";
                    if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') msg = "Accès caméra refusé";
                    else if (err.message.includes("Aucun administrateur")) msg = "Face ID non configuré (Cloud)";
                    else if (err.message) msg = err.message;

                    setScanMessage(msg);
                    setTimeout(() => shutdown(), 5000);
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
    }, [isOpen]); // Removed adminAccounts dependency

    const shutdown = () => {
        stopWebcam();
        onClose();
    };

    const processLabeledImages = async (admins) => {
        const labeledDescriptors = [];
        // Filter active admins with Face ID configured
        const activeAdmins = admins.filter(a => a.status === 'Active' && a.faceIdConfigured);

        console.log(`Processing ${activeAdmins.length} admins for Face ID...`);

        for (const admin of activeAdmins) {
            try {
                // 1. FAST PATH: Use stored 128D descriptor (New standard)
                if (admin.faceDescriptor) {
                    // Check if it's an array or object (Firestore sometimes stores as object)
                    let descriptorArray = admin.faceDescriptor;
                    if (!Array.isArray(descriptorArray) && typeof descriptorArray === 'object') {
                        descriptorArray = Object.values(descriptorArray);
                    }

                    if (Array.isArray(descriptorArray) && descriptorArray.length === 128) {
                        const float32Descriptor = new Float32Array(descriptorArray);
                        labeledDescriptors.push(new faceapi.LabeledFaceDescriptors(admin.username, [float32Descriptor]));
                        console.log(`Loaded descriptor for ${admin.username} (Fast)`);
                        continue;
                    }
                }

                // 2. SLOW PATH: Use stored image (Legacy/Fallback)
                if (admin.faceIdData && admin.faceIdData.startsWith('data:image')) {
                    console.log(`Generating descriptor from image for ${admin.username} (Slow)...`);

                    // Validation basic
                    try {
                        const base64Data = admin.faceIdData.split(',')[1];
                        if (!base64Data) throw new Error("No base64");
                        window.atob(base64Data);
                    } catch (e) {
                        console.warn(`Invalid base64 for ${admin.username}`);
                        continue;
                    }

                    const img = new Image();
                    img.crossOrigin = "anonymous";

                    await new Promise((resolve, reject) => {
                        img.onload = resolve;
                        img.onerror = reject;
                        img.src = admin.faceIdData;
                        setTimeout(() => reject(new Error("Image load timeout")), 3000);
                    });

                    // Detect face from the stored image
                    const detections = await faceapi.detectSingleFace(img, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
                        .withFaceLandmarks()
                        .withFaceDescriptor();

                    if (detections) {
                        labeledDescriptors.push(new faceapi.LabeledFaceDescriptors(admin.username, [detections.descriptor]));
                        console.log(`Generated descriptor for ${admin.username}`);
                    } else {
                        console.warn(`No face found in stored image for ${admin.username}`);
                    }
                }
            } catch (err) {
                console.warn(`Skipping profile: ${admin.username}`, err);
            }
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

        // INTELLIGENT ADAPTIVE THRESHOLD
        // We start with the standard model.
        // If we consistently find a face but it doesn't match, we assume poor lighting/angle
        // and guide the user.

        return setInterval(async () => {
            if (!videoRef.current || !isOpen) return;

            // 1. INTELLIGENT BRIGHTNESS CHECK
            // Check if scene is too dark
            if (videoRef.current.videoWidth > 0) {
                // Simple sampling could go here, but for now we rely on detecion failure to infer it.
            }

            // 2-SECOND TIMEOUT CHECK
            const elapsed = Date.now() - startTimeRef.current;
            if (elapsed > 4000 && currentPhase === 'scanning') { // Give more time (4s) for angle adjustment
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
                    setScanMessage("Une seule personne à la fois !");
                    return;
                }

                if (detections.length > 0) {
                    const detection = detections[0];
                    // USE 0.6 THRESHOLD (INTELLIGENT/PERMISSIVE)
                    // The FaceMatcher passed in is already configured, but we can double check logic here.
                    const match = faceMatcher.findBestMatch(detection.descriptor);

                    // CUSTOM INTELLIGENT LOGIC
                    // face-api 'unknown' means distance > threshold.
                    // We want to handle "almost" matches (e.g. distance 0.65) by asking for better angle.

                    const isIdentityValid = match.label !== 'unknown' && !match.label.startsWith('error_');

                    if (currentPhase === 'scanning') {
                        if (isIdentityValid) {
                            // MATCH AGAINST FETCHED ADMINS
                            const admin = activeAdminsRef.current.find(a => a.username === match.label);
                            if (admin) {
                                pendingAdminRef.current = admin;
                                currentPhase = 'liveness';
                                setScanMessage("Identité vérifiée. Analyse vitale...");
                            }
                        } else {
                            // INTELLIGENT FEEDBACK
                            // If we see a face but don't recognize it
                            setScanMessage("Ajustez l'angle ou la lumière...");
                        }
                    }
                    else if (currentPhase === 'liveness') {
                        // ... (existing liveness logic)
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
                        // Smile OR Happy Expression (More robust)
                        if (detection.expressions.happy > 0.5 || detection.expressions.surprised > 0.5) livenessSequence++;

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
                } else {
                    setScanMessage("Recherche de visage...");
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
                                autoPlay
                                playsInline
                                webkit-playsinline="true"
                                className={`w-full h-full object-cover transform scale-125 transition-transform duration-700 ${loadingState === 'success' ? 'grayscale-0' : 'grayscale-[20%]'
                                    }`}
                            />
                        </div>
                    </motion.div>

                    {/* STATUS MESSAGE (Minimalist) */}
                    <div className="mt-8 h-8 px-4 text-center">
                        <AnimatePresence mode='wait'>
                            {scanMessage && (
                                <motion.p
                                    key={scanMessage}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -10 }}
                                    className={`text-sm font-medium tracking-wide break-words ${loadingState === 'failure_moment' || loadingState === 'locked' || loadingState === 'error' ? 'text-red-400' :
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
