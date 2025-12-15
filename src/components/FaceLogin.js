import React, { useEffect, useRef, useState } from 'react';
import * as faceapi from 'face-api.js';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Camera, ShieldCheck, AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from './ui/button';

const FaceLogin = ({ isOpen, onClose, onLogin, adminAccounts }) => {
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const [isLoading, setIsLoading] = useState(true);
    const [loadingStep, setLoadingStep] = useState('Chargement des modèles IA...');
    const [error, setError] = useState(null);
    const [isScanning, setIsScanning] = useState(false);
    const [matchFound, setMatchFound] = useState(null);

    // Initialisation
    useEffect(() => {
        let isMounted = true;

        const loadModelsAndStart = async () => {
            if (!isOpen) return;

            try {
                setIsLoading(true);
                setError(null);
                setMatchFound(null);

                // 1. Charger les modèles
                setLoadingStep('Chargement du cerveau IA...');
                await Promise.all([
                    faceapi.nets.ssdMobilenetv1.loadFromUri('/models'),
                    faceapi.nets.faceLandmark68.loadFromUri('/models'),
                    faceapi.nets.faceRecognitionNet.loadFromUri('/models')
                ]);

                // 2. Préparer les visages de référence (Admins)
                setLoadingStep('Analyse des dossiers Admin...');
                const labeledDescriptors = await loadLabeledImages();
                const faceMatcher = new faceapi.FaceMatcher(labeledDescriptors, 0.6);

                // 3. Démarrer la webcam
                setLoadingStep('Activation des capteurs visuels...');
                const stream = await navigator.mediaDevices.getUserMedia({ video: {} });

                if (videoRef.current && isMounted) {
                    videoRef.current.srcObject = stream;

                    // Attendre que la vidéo joue pour démarrer la détection
                    videoRef.current.onloadedmetadata = () => {
                        videoRef.current.play();
                        setIsLoading(false);
                        setIsScanning(true);
                        startDetection(faceMatcher);
                    };
                }

            } catch (err) {
                console.error("FaceLogin Error:", err);
                if (isMounted) setError("Impossible d'initialiser le Face ID. Vérifiez que la caméra est accessible.");
                setIsLoading(false);
            }
        };

        if (isOpen) {
            loadModelsAndStart();
        }

        return () => {
            isMounted = false;
            stopVideo();
        };
    }, [isOpen]);

    const stopVideo = () => {
        if (videoRef.current && videoRef.current.srcObject) {
            videoRef.current.srcObject.getTracks().forEach(track => track.stop());
            videoRef.current.srcObject = null;
        }
        setIsScanning(false);
    };

    const loadLabeledImages = async () => {
        return Promise.all(
            adminAccounts.map(async (admin) => {
                try {
                    // Charger l'image de profil de l'admin
                    const img = await faceapi.fetchImage(admin.photo);
                    // Détecter le visage
                    const detections = await faceapi.detectSingleFace(img).withFaceLandmarks().withFaceDescriptor();

                    if (!detections) {
                        throw new Error(`Pas de visage trouvé pour ${admin.firstName}`);
                    }

                    return new faceapi.LabeledFaceDescriptors(admin.username, [detections.descriptor]);
                } catch (err) {
                    console.warn(`Skip admin ${admin.firstName}:`, err);
                    // Retourner un descripteur vide ou factice pour ne pas bloquer
                    // Dans un cas réel, on filtrerait, mais ici on veut éviter que Promise.all fail.
                    // On retourne un "unknown" qui ne matchera jamais
                    return new faceapi.LabeledFaceDescriptors(`error_${admin.username}`, [new Float32Array(128)]);
                }
            })
        );
    };

    const startDetection = (faceMatcher) => {
        const interval = setInterval(async () => {
            if (!videoRef.current || !canvasRef.current || !isOpen) {
                clearInterval(interval);
                return;
            }

            // Détection sur la vidéo
            const detections = await faceapi.detectAllFaces(videoRef.current)
                .withFaceLandmarks()
                .withFaceDescriptors();

            // Redimensionner le canvas
            const displaySize = { width: videoRef.current.videoWidth, height: videoRef.current.videoHeight };
            faceapi.matchDimensions(canvasRef.current, displaySize);

            // Redimensionner les détections
            const resizedDetections = faceapi.resizeResults(detections, displaySize);

            // Nettoyer le canvas
            const ctx = canvasRef.current.getContext('2d');
            ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);

            // Matcher les visages
            const results = resizedDetections.map(d => faceMatcher.findBestMatch(d.descriptor));

            results.forEach((result, i) => {
                const box = resizedDetections[i].detection.box;
                const drawBox = new faceapi.draw.DrawBox(box, {
                    label: result.toString(),
                    boxColor: result.label !== 'unknown' && !result.label.startsWith('error') ? '#00ff00' : '#ff0000'
                });
                drawBox.draw(canvasRef.current);

                // Si on trouve un match valide
                if (result.label !== 'unknown' && !result.label.startsWith('error') && !matchFound) {
                    setMatchFound(result.label);
                    clearInterval(interval);
                    stopVideo();

                    // Trouver l'objet admin complet
                    const admin = adminAccounts.find(a => a.username === result.label);

                    // Petit délai pour l'effet "Succès"
                    setTimeout(() => {
                        onLogin(admin);
                    }, 1500);
                }
            });

        }, 500); // Check toutes les 500ms
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md"
            >
                <div className="relative w-full max-w-lg bg-slate-900 border border-slate-700 rounded-2xl overflow-hidden shadow-2xl mx-4">
                    {/* Header */}
                    <div className="flex justify-between items-center p-4 border-b border-slate-800 bg-slate-900/50">
                        <div className="flex items-center gap-2 text-white">
                            <ShieldCheck className="h-5 w-5 text-blue-500" />
                            <span className="font-bold">GouvChain Face ID</span>
                        </div>
                        <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
                            <X className="h-6 w-6" />
                        </button>
                    </div>

                    {/* Video Area */}
                    <div className="relative aspect-video bg-black flex items-center justify-center overflow-hidden">
                        {/* Status Overlay */}
                        {isLoading && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center text-blue-400 space-y-4 z-20 bg-slate-900/80">
                                <Loader2 className="h-10 w-10 animate-spin" />
                                <p className="text-sm font-mono animate-pulse">{loadingStep}</p>
                            </div>
                        )}

                        {error && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center text-red-500 p-6 text-center z-20 bg-slate-900/90">
                                <AlertTriangle className="h-12 w-12 mb-2" />
                                <p>{error}</p>
                                <Button variant="outline" className="mt-4" onClick={onClose}>Fermer</Button>
                            </div>
                        )}

                        {/* Success Overlay */}
                        {matchFound && (
                            <motion.div
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="absolute inset-0 flex flex-col items-center justify-center bg-green-500/20 backdrop-blur-sm z-30"
                            >
                                <div className="h-20 w-20 bg-green-500 rounded-full flex items-center justify-center mb-4 shadow-lg shadow-green-500/50">
                                    <ShieldCheck className="h-10 w-10 text-white" />
                                </div>
                                <h3 className="text-2xl font-bold text-white mb-1">Identité Confirmée</h3>
                                <p className="text-green-300">Bienvenue, {matchFound}</p>
                            </motion.div>
                        )}

                        {/* Video Element */}
                        <video
                            ref={videoRef}
                            muted
                            playsInline
                            className={`w-full h-full object-cover ${matchFound ? 'blur-sm' : ''}`}
                        />

                        {/* Canvas for Drawing Boxes */}
                        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />

                        {/* Scanner Animation UI */}
                        {!isLoading && !matchFound && !error && (
                            <div className="absolute inset-0 pointer-events-none">
                                {/* Corners */}
                                <div className="absolute top-8 left-8 w-16 h-16 border-t-4 border-l-4 border-blue-500/50 rounded-tl-xl" />
                                <div className="absolute top-8 right-8 w-16 h-16 border-t-4 border-r-4 border-blue-500/50 rounded-tr-xl" />
                                <div className="absolute bottom-8 left-8 w-16 h-16 border-b-4 border-l-4 border-blue-500/50 rounded-bl-xl" />
                                <div className="absolute bottom-8 right-8 w-16 h-16 border-b-4 border-r-4 border-blue-500/50 rounded-br-xl" />

                                {/* Scanning Bar */}
                                <motion.div
                                    animate={{ top: ['10%', '90%', '10%'] }}
                                    transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                                    className="absolute left-0 w-full h-0.5 bg-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.8)]"
                                />

                                <div className="absolute bottom-4 left-0 right-0 text-center">
                                    <p className="inline-block bg-black/50 backdrop-blur px-3 py-1 rounded-full text-xs text-blue-200 font-mono">
                                        RECHERCHE BIOMÉTRIQUE EN COURS...
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </motion.div>
        </AnimatePresence>
    );
};

export default FaceLogin;
