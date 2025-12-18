import React, { useState, useEffect, useRef } from 'react';
import { jsPDF } from "jspdf";
import emailjs from '@emailjs/browser';
import Web3 from 'web3';
import * as faceapi from 'face-api.js';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Label } from './ui/label';
import {
    Shield, AlertTriangle, CheckCircle, LogOut, FileCheck, FileX,
    Network, Clock, Copy, FileText, Download, RefreshCw,
    LayoutDashboard, Menu, ChevronRight, Users, Award, Eye, EyeOff,
    Camera, Upload, X, Ban, ShieldAlert, Search, PanelLeft, Mail, ScanFace
} from 'lucide-react';
import { Link } from 'react-router-dom';
import CertificatePreview from './CertificatePreview';
import { AdminTable } from './AdminTable';
import { uploadToIPFS, unpinFromIPFS } from '../utils/ipfs';
import { CONTRACT_ADDRESS, CONTRACT_ABI, ADMIN_ADDRESS, EMAILJS_CONFIG, APP_URL, NETWORK_CONFIG } from '../config';
import { db } from '../firebase';
import { collection, getDocs, addDoc, updateDoc, doc, deleteDoc, setDoc } from 'firebase/firestore';

// MetaMask Logo Component
const MetaMaskLogo = () => (
    <svg viewBox="0 0 32 32" className="h-6 w-6 mr-2">
        <path fill="#E17726" d="M29.2 12.4l-1.9-5.6c-.1-.3-.5-.4-.7-.2l-5.3 3.6-4.5-5.3c-.2-.2-.5-.2-.7 0l-4.5 5.3-5.3-3.6c-.3-.2-.6-.1-.7.2L3.8 12.4c-.1.3 0 .7.3.8l8.6 4.3-1.6 5.9c-.1.3.1.6.4.7l4.5 1.4 4.5-1.4c.3-.1.5-.4.4-.7l-1.6-5.9 8.6-4.3c.3-.1.4-.5.3-.8z" />
        <path fill="#E2761B" d="M8.1 12.3v.1l-5.6 1.8c-.3.1-.5.5-.4.8l1.6 5.9c.1.3.4.5.7.4l4.5-1.4 4.5 1.4c.3.1.6-.1.7-.4l1.6-5.9c.1-.3-.1-.7-.4-.8l-5.6-1.8-5.6-1.8z" />
    </svg>
);

const SidebarItem = ({ icon, label, active, onClick, collapsed }) => (
    <button
        onClick={onClick}
        className={`w-full flex items-center ${collapsed ? 'justify-center px-2' : 'gap-3 px-4'} py-3 rounded-xl text-sm font-medium transition-all duration-200 ${active
            ? 'bg-white/20 text-white shadow-md'
            : 'text-blue-200 hover:bg-white/10 hover:text-white'
            }`}
        title={collapsed ? label : undefined}
    >
        {!collapsed && (
            <motion.span
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                className="whitespace-nowrap"
            >
                {label}
            </motion.span>
        )}
        <div className={`${collapsed ? '' : 'ml-auto'} flex-shrink-0`}>
            {icon}
        </div>
    </button>
);

const AdminSidebarHeader = ({ open }) => (
    <aside className="h-screen bg-gradient-to-b from-slate-900 to-slate-800 border-r border-white/10 flex flex-col">
        <div className="p-6 border-b border-white/10">
            <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-blue-900 text-white flex items-center justify-center font-bold text-sm shadow-md">
                    AD
                </div>
                {open && (
                    <div className="overflow-hidden">
                        <p className="text-sm font-bold text-sidebar-foreground truncate">Administrateur</p>
                        <p className="text-xs text-muted-foreground truncate">Super Admin</p>
                    </div>
                )}
            </div>
        </div>
    </aside>
);

const StatsCard = ({ title, value, icon, gradient, trend, details }) => (
    <Card className={`border-none shadow-lg ${gradient} text-white overflow-hidden relative`}>
        <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full -mr-8 -mt-8 blur-2xl"></div>
        <div className="absolute bottom-0 left-0 w-20 h-20 bg-black/10 rounded-full -ml-6 -mb-6 blur-xl"></div>

        <CardContent className="p-6 relative z-10">
            <div className="flex items-center justify-between mb-4">
                <div className="p-3 rounded-xl bg-white/20 backdrop-blur-sm">
                    {icon}
                </div>
                <span className="text-xs font-medium bg-white/20 px-2 py-1 rounded-full backdrop-blur-sm">
                    {trend}
                </span>
            </div>
            <div>
                <h3 className="text-blue-100 text-sm font-medium mb-1">{title}</h3>
                <p className="text-2xl font-bold mb-1">{value}</p>
                {details && (
                    <p className="text-xs text-blue-200/80 font-mono truncate max-w-full mt-1">
                        {details}
                    </p>
                )}
            </div>
        </CardContent>
    </Card>
);

const AdminPage = () => {
    const [account, setAccount] = useState(null);
    const [contract, setContract] = useState(null);
    const [status, setStatus] = useState(null);
    const [isAdmin, setIsAdmin] = useState(false);
    const [currentTime, setCurrentTime] = useState(new Date());

    // Initialiser events et stats depuis localStorage pour la persistance
    const [events, setEvents] = useState(() => {
        const savedEvents = localStorage.getItem('dashboardEvents');
        if (savedEvents) {
            try {
                const parsed = JSON.parse(savedEvents);
                return parsed.map(evt => ({
                    ...evt,
                    timestamp: new Date(evt.timestamp),
                    issuedAt: evt.issuedAt // Keep as string or convert if needed
                }));
            } catch (e) {
                console.error("Error parsing saved events:", e);
                return [];
            }
        }
        return [];
    });
    const [stats, setStats] = useState(() => {
        const savedStats = localStorage.getItem('dashboardStats');
        if (savedStats) {
            try {
                const parsed = JSON.parse(savedStats);
                return {
                    ...parsed,
                    lastEmission: parsed.lastEmission ? new Date(parsed.lastEmission) : null
                };
            } catch (e) {
                console.error("Error parsing saved stats:", e);
                return { emis: 0, total: 0, lastEmission: null };
            }
        }
        return { emis: 0, total: 0, lastEmission: null };
    });
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [isLoadingData, setIsLoadingData] = useState(false);

    const [activeTab, setActiveTab] = useState('dashboard'); // 'dashboard', 'issue', 'admins'

    // Admin State Management (Firestore)
    const [admins, setAdmins] = useState([]);
    const [loadingAdmins, setLoadingAdmins] = useState(true);

    const [newAdmin, setNewAdmin] = useState({ firstName: '', lastName: '', username: '', password: '', photo: '', faceIdData: '', faceIdConfigured: false });
    const [editingAdmin, setEditingAdmin] = useState(null);
    const [showWebcam, setShowWebcam] = useState(false);
    const [webcamStream, setWebcamStream] = useState(null);
    const [webcamMode, setWebcamMode] = useState('photo'); // 'photo' or 'faceId'
    const videoRef = useRef(null);
    const canvasRef = useRef(null);

    // Face ID scanning states
    const [faceIdScanPhase, setFaceIdScanPhase] = useState('idle'); // idle, initializing, scanning, processing, success, error
    const [scanProgress, setScanProgress] = useState(0);
    const [scanMessage, setScanMessage] = useState('');
    const scanIntervalRef = useRef(null);

    // Face Mesh & Anti-Spoofing States
    const meshCanvasRef = useRef(null);
    const [currentLandmarks, setCurrentLandmarks] = useState(null);
    const [headChallenge, setHeadChallenge] = useState(null); // 'left', 'right', 'center', null
    const [challengeCompleted, setChallengeCompleted] = useState({ left: false, right: false });
    const landmarkHistoryRef = useRef([]);
    const animationFrameRef = useRef(null);


    const [showPassword, setShowPassword] = useState(false);
    const [currentUser, setCurrentUser] = useState(null);
    const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);

    useEffect(() => {
        const handleResize = () => {
            setIsMobile(window.innerWidth < 1024);
            if (window.innerWidth < 1024) {
                setSidebarOpen(false);
            } else {
                setSidebarOpen(true);
            }
        };

        // Initial check
        handleResize();

        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useEffect(() => {
        const userStr = sessionStorage.getItem('currentUser');
        if (userStr) {
            setCurrentUser(JSON.parse(userStr));
        }
    }, []);

    // Fetch Admins from Firestore
    useEffect(() => {
        const fetchAdmins = async () => {
            setLoadingAdmins(true);
            try {
                const querySnapshot = await getDocs(collection(db, "admins"));
                const adminsList = querySnapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));
                setAdmins(adminsList);
            } catch (error) {
                console.error("Error fetching admins: ", error);
            } finally {
                setLoadingAdmins(false);
            }
        };

        fetchAdmins();
    }, []);

    const handleAddAdmin = async (e) => {
        e.preventDefault();
        setStatus({ type: 'loading', message: editingAdmin ? 'Modification en cours...' : 'Ajout en cours...' });

        try {
            if (editingAdmin) {
                // Mode édition
                const adminRef = doc(db, "admins", editingAdmin.id);
                // Exclude ID from the update data
                const { id, ...updateData } = { ...editingAdmin, ...newAdmin };

                await updateDoc(adminRef, updateData);

                // Update local state immediately for UI responsiveness
                setAdmins(admins.map(admin =>
                    admin.id === editingAdmin.id
                        ? { ...admin, ...newAdmin }
                        : admin
                ));

                // Synchronisation si l'admin modifié est l'utilisateur connecté
                if (currentUser && editingAdmin.username === currentUser.username) {
                    const updatedCurrentUser = { ...currentUser, ...newAdmin };
                    setCurrentUser(updatedCurrentUser);
                    sessionStorage.setItem('currentUser', JSON.stringify(updatedCurrentUser));
                }

                setEditingAdmin(null);
                setStatus({ type: 'success', message: 'Administrateur modifié avec succès (Cloud Sychronisé).' });
            } else {
                // Mode ajout
                const newAdminData = {
                    ...newAdmin,
                    status: 'Active',
                    createdAt: new Date().toISOString()
                };

                const docRef = await addDoc(collection(db, "admins"), newAdminData);

                // Update local state
                setAdmins([...admins, { id: docRef.id, ...newAdminData }]);

                setStatus({ type: 'success', message: 'Nouvel administrateur ajouté avec succès (Cloud Sychronisé).' });
            }
            setNewAdmin({ firstName: '', lastName: '', username: '', password: '', photo: '', faceIdData: '', faceIdConfigured: false });
            setShowPassword(false);
        } catch (error) {
            console.error("Error saving admin:", error);
            setStatus({ type: 'error', message: 'Erreur lors de la sauvegarde sur le Cloud.' });
        }
        setTimeout(() => setStatus(null), 3000);
    };

    // Fonction pour supprimer tous les admins (Danger Zone)
    const handleResetAdmins = async () => {
        if (window.confirm('ATTENTION : Cela va supprimer TOUS les administrateurs de la base de données. Il faudra en créer manuellement via la console Firebase pour retrouver l\'accès. Continuer ?')) {
            setStatus({ type: 'loading', message: 'Suppression de tous les administrateurs...' });
            try {
                // Delete all current admins
                const querySnapshot = await getDocs(collection(db, "admins"));
                const deletePromises = querySnapshot.docs.map(doc => deleteDoc(doc.ref));
                await Promise.all(deletePromises);

                setAdmins([]);
                setStatus({ type: 'success', message: 'Tous les administrateurs ont été supprimés.' });
            } catch (error) {
                console.error("Reset error:", error);
                setStatus({ type: 'error', message: 'Erreur lors de la suppression.' });
            }
            setTimeout(() => setStatus(null), 3000);
        }
    };

    const handleEditAdmin = (admin) => {
        setEditingAdmin(admin);
        setNewAdmin({
            firstName: admin.firstName,
            lastName: admin.lastName,
            username: admin.username,
            password: admin.password,
            photo: admin.photo || '',
            faceIdData: admin.faceIdData || '',
            faceIdConfigured: admin.faceIdConfigured || false
        });
        setShowPassword(false);
        // Scroll to form
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };


    const handleCancelEdit = () => {
        setEditingAdmin(null);
        setNewAdmin({ firstName: '', lastName: '', username: '', password: '', photo: '' });
        setShowPassword(false);
    };

    const handleRemoveAdmin = async (id) => {
        if (window.confirm('Êtes-vous sûr de vouloir supprimer cet administrateur ?')) {
            try {
                await deleteDoc(doc(db, "admins", id));
                setAdmins(admins.filter(admin => admin.id !== id));
                setStatus({ type: 'success', message: 'Administrateur supprimé du Cloud.' });
            } catch (error) {
                console.error("Delete error:", error);
                setStatus({ type: 'error', message: 'Erreur lors de la suppression.' });
            }
            setTimeout(() => setStatus(null), 3000);
        }
    };

    const handleLogout = () => {
        sessionStorage.removeItem('isLoggedIn');
        sessionStorage.removeItem('currentUser');
        window.location.href = '/login';
    };

    // ===== FACE ID STYLE IPHONE - NOUVELLE IMPLÉMENTATION =====

    // Face mesh triangles indices for 68-point landmarks (simplified Delaunay)
    const FACE_MESH_TRIANGLES = [
        // Jawline
        [0, 1, 36], [1, 2, 41], [2, 3, 31], [3, 4, 48], [4, 5, 48], [5, 6, 59],
        [6, 7, 58], [7, 8, 57], [8, 9, 56], [9, 10, 55], [10, 11, 54], [11, 12, 35],
        [12, 13, 42], [13, 14, 47], [14, 15, 45], [15, 16, 45],
        // Forehead/Eyebrows
        [17, 18, 37], [18, 19, 38], [19, 20, 39], [20, 21, 27],
        [22, 23, 27], [23, 24, 44], [24, 25, 43], [25, 26, 45],
        // Nose
        [27, 28, 39], [28, 29, 42], [29, 30, 35], [30, 31, 48], [30, 35, 54],
        [31, 32, 48], [32, 33, 51], [33, 34, 52], [34, 35, 54],
        // Left eye
        [36, 37, 41], [37, 38, 40], [38, 39, 40], [39, 40, 41], [36, 41, 1],
        // Right eye
        [42, 43, 47], [43, 44, 46], [44, 45, 46], [45, 46, 47], [42, 47, 13],
        // Mouth outer
        [48, 49, 60], [49, 50, 61], [50, 51, 62], [51, 52, 63], [52, 53, 64], [53, 54, 55],
        // Mouth inner
        [60, 61, 67], [61, 62, 66], [62, 63, 65], [63, 64, 65],
        // Center connections
        [27, 39, 42], [31, 35, 30], [48, 59, 60], [54, 55, 64],
        // Cheeks
        [1, 31, 41], [2, 31, 3], [13, 35, 47], [12, 35, 13],
        [36, 1, 0], [45, 16, 15]
    ];

    // Draw face mesh overlay (BLUE THEME & PROGRESSIVE)
    const drawFaceMesh = (landmarks, canvas, videoWidth, videoHeight, progress) => {
        if (!canvas || !landmarks) return;

        const ctx = canvas.getContext('2d');
        const points = landmarks.positions;

        // Handle scaling
        const scale = canvas.width / videoWidth;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // PROGRESSIVE VISIBILITY:
        // 0-30%: Invisible / Very faint dots
        // 30-70%: Faint lines appear (Blue)
        // 70-100%: Full mesh glow (Blue/Cyan)

        const opacity = Math.max(0, (progress - 20) / 80); // Starts appearing after 20%
        const time = Date.now() / 1000;

        if (opacity > 0.05) {
            // Blue Cyan Gradient Style
            ctx.strokeStyle = `rgba(0, 160, 255, ${0.4 * opacity})`; // Blue lines
            ctx.lineWidth = 1;
            ctx.shadowColor = 'rgba(0, 200, 255, 0.5)';
            ctx.shadowBlur = 5 * opacity;

            // Draw triangular mesh
            FACE_MESH_TRIANGLES.forEach(([i, j, k]) => {
                if (points[i] && points[j] && points[k]) {
                    ctx.beginPath();
                    ctx.moveTo(points[i].x * scale, points[i].y * scale);
                    ctx.lineTo(points[j].x * scale, points[j].y * scale);
                    ctx.lineTo(points[k].x * scale, points[k].y * scale);
                    ctx.closePath();
                    ctx.stroke();
                }
            });
        }

        // Draw dots (Always visible but subtle blue)
        points.forEach((point, idx) => {
            // Only show some points initially, all points later
            if (progress < 50 && idx % 3 !== 0) return;

            const pointPulse = 0.5 + Math.sin(time * 5 + idx * 0.2) * 0.5;
            ctx.fillStyle = `rgba(0, 180, 255, ${0.6 * pointPulse})`; // Cyan dots
            ctx.beginPath();
            ctx.arc(point.x * scale, point.y * scale, 1.5, 0, Math.PI * 2);
            ctx.fill();
        });
    };

    // Calculate yaw (left/right head turn)
    const calculateYaw = (landmarks) => {
        if (!landmarks) return 0;
        const points = landmarks.positions;
        const noseTip = points[30];
        const leftJaw = points[0];
        const rightJaw = points[16];
        const leftDist = Math.hypot(noseTip.x - leftJaw.x, noseTip.y - leftJaw.y);
        const rightDist = Math.hypot(noseTip.x - rightJaw.x, noseTip.y - rightJaw.y);
        return (rightDist - leftDist) / (rightDist + leftDist) * 2;
    };

    // Analyze micro-movements
    const analyzeMicroMovements = (currentPoints) => {
        if (!currentPoints) return { isLive: false, variance: 0 };
        const history = landmarkHistoryRef.current;
        history.push(currentPoints.positions.map(p => ({ x: p.x, y: p.y })));
        if (history.length > 10) history.shift();
        if (history.length < 5) return { isLive: true, variance: 1 };

        const keyIndices = [30, 36, 45, 48, 54];
        let totalVariance = 0;
        keyIndices.forEach(idx => {
            const xValues = history.map(frame => frame[idx]?.x || 0);
            const yValues = history.map(frame => frame[idx]?.y || 0);
            const xMean = xValues.reduce((a, b) => a + b, 0) / xValues.length;
            const yMean = yValues.reduce((a, b) => a + b, 0) / yValues.length;
            const xVar = xValues.reduce((sum, v) => sum + Math.pow(v - xMean, 2), 0) / xValues.length;
            const yVar = yValues.reduce((sum, v) => sum + Math.pow(v - yMean, 2), 0) / yValues.length;
            totalVariance += Math.sqrt(xVar + yVar);
        });
        const averageVariance = totalVariance / keyIndices.length;
        return { isLive: averageVariance > 0.3, variance: averageVariance };
    };

    const resetFaceMeshStates = () => {
        setCurrentLandmarks(null);
        setHeadChallenge(null);
        setChallengeCompleted({ left: false, right: false });
        landmarkHistoryRef.current = [];
        if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = null;
        }
    };

    // Fonction de scan Face ID automatique style iPhone
    const startFaceIdScan = async () => {
        setFaceIdScanPhase('initializing');
        setScanProgress(0);
        setScanMessage('Initialisation de Face ID...');
        resetFaceMeshStates();

        try {
            await Promise.all([
                faceapi.nets.ssdMobilenetv1.loadFromUri('/models'),
                faceapi.nets.faceLandmark68Net.loadFromUri('/models'),
                faceapi.nets.faceRecognitionNet.loadFromUri('/models')
            ]);

            setScanProgress(15);
            setScanMessage('Regardez la caméra...');
            setFaceIdScanPhase('scanning');

            // Start challenge sooner
            setTimeout(() => setHeadChallenge('center'), 1000);

            let scanAttempts = 0;
            const maxAttempts = 150; // Increased timeout
            let faceDescriptorBuffer = null;
            let highQualityFrames = 0;

            scanIntervalRef.current = setInterval(async () => {
                scanAttempts++;
                if (scanAttempts > maxAttempts) {
                    clearInterval(scanIntervalRef.current);
                    resetFaceMeshStates();
                    setFaceIdScanPhase('error');
                    setScanMessage('Temps écoulé. Réessayez.');
                    return;
                }

                if (videoRef.current && meshCanvasRef.current) {
                    const video = videoRef.current;
                    const meshCanvas = meshCanvasRef.current;

                    if (video.videoWidth > 0 && video.videoHeight > 0) {
                        if (meshCanvas.width !== video.videoWidth) {
                            meshCanvas.width = video.videoWidth;
                            meshCanvas.height = video.videoHeight;
                        }

                        try {
                            const detections = await faceapi.detectSingleFace(video, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
                                .withFaceLandmarks()
                                .withFaceDescriptor();

                            if (detections) {
                                const landmarks = detections.landmarks;

                                // CALCULATE PROGRESS FOR VISUALS
                                // We use a state callback to get current progress safely if needed,
                                // but here we pass 'scanProgress' which is state.
                                // NOTE: In setInterval state is stale. We need a ref or functional update.
                                // Better: Pass a value derived from challenges.

                                let currentProgressValue = 0;
                                if (headChallenge === 'left') currentProgressValue = 40;
                                else if (headChallenge === 'right') currentProgressValue = 60;
                                else if (headChallenge === 'final') currentProgressValue = 85;
                                else currentProgressValue = 20;

                                // DRAW MESH (BLUE)
                                drawFaceMesh(landmarks, meshCanvas, video.videoWidth, video.videoHeight, currentProgressValue);
                                setCurrentLandmarks(landmarks);

                                const livenessCheck = analyzeMicroMovements(landmarks);
                                const yaw = calculateYaw(landmarks);

                                // RELAXED THRESHOLDS for "Stuck at 35%" fix
                                // Center: |yaw| < 0.2 (was 0.15)
                                // Left: yaw < -0.2 (was -0.25)
                                // Right: yaw > 0.2 (was 0.25)

                                if (headChallenge === 'center') {
                                    if (Math.abs(yaw) < 0.25) { // Easier to center
                                        setTimeout(() => setHeadChallenge('left'), 200);
                                        setScanProgress(prev => Math.min(prev + 5, 40));
                                        setScanMessage('Tournez légèrement la tête à GAUCHE ⬅️');
                                    } else {
                                        // Guiding user if stuck
                                        setScanMessage(yaw > 0 ? "Tournez un peu à GAUCHE pour centrer" : "Tournez un peu à DROITE pour centrer");
                                    }
                                } else if (headChallenge === 'left' && yaw < -0.15) { // Easier left
                                    setChallengeCompleted(prev => ({ ...prev, left: true }));
                                    setTimeout(() => setHeadChallenge('right'), 200);
                                    setScanProgress(prev => Math.min(prev + 15, 60));
                                    setScanMessage('Bien ! Maintenant à DROITE ➡️');
                                } else if (headChallenge === 'right' && yaw > 0.15) { // Easier right
                                    setChallengeCompleted(prev => ({ ...prev, right: true }));
                                    setTimeout(() => setHeadChallenge('final'), 200);
                                    setScanProgress(prev => Math.min(prev + 15, 80));
                                    setScanMessage('Parfait ! Recentrez pour finir...');
                                } else if (headChallenge === 'final') {
                                    if (Math.abs(yaw) < 0.2 && detections.detection.score > 0.85) {
                                        highQualityFrames++;
                                        setScanProgress(prev => Math.min(prev + 2, 98));

                                        if (!faceDescriptorBuffer || detections.detection.score > 0.90) {
                                            faceDescriptorBuffer = Array.from(detections.descriptor);
                                        }

                                        if (highQualityFrames >= 3 && livenessCheck.isLive) {
                                            clearInterval(scanIntervalRef.current);
                                            setFaceIdScanPhase('processing');
                                            setScanMessage('Analyse biométrique...');

                                            // Capture & Save
                                            const captureCanvas = canvasRef.current;
                                            captureCanvas.width = video.videoWidth;
                                            captureCanvas.height = video.videoHeight;
                                            const context = captureCanvas.getContext('2d');
                                            context.drawImage(video, 0, 0, captureCanvas.width, captureCanvas.height);
                                            const faceDataUrl = captureCanvas.toDataURL('image/jpeg', 0.95);

                                            const meshCtx = meshCanvas.getContext('2d');
                                            meshCtx.clearRect(0, 0, meshCanvas.width, meshCanvas.height);

                                            setTimeout(async () => {
                                                setFaceIdScanPhase('success');
                                                setScanProgress(100);
                                                setScanMessage('Face ID Configuré !');

                                                setNewAdmin(prev => ({
                                                    ...prev,
                                                    faceIdConfigured: true,
                                                    faceIdData: faceDataUrl,
                                                    faceDescriptor: faceDescriptorBuffer
                                                }));

                                                if (editingAdmin && editingAdmin.id) {
                                                    try {
                                                        const adminRef = doc(db, "admins", editingAdmin.id);
                                                        await updateDoc(adminRef, {
                                                            faceIdConfigured: true,
                                                            faceIdData: faceDataUrl,
                                                            faceDescriptor: faceDescriptorBuffer
                                                        });
                                                        setAdmins(prev => prev.map(adm =>
                                                            adm.id === editingAdmin.id
                                                                ? { ...adm, faceIdConfigured: true, faceIdData: faceDataUrl, faceDescriptor: faceDescriptorBuffer }
                                                                : adm
                                                        ));
                                                        if (currentUser && currentUser.username === editingAdmin.username) {
                                                            const updatedUser = { ...currentUser, faceIdConfigured: true, faceIdData: faceDataUrl, faceDescriptor: faceDescriptorBuffer };
                                                            setCurrentUser(updatedUser);
                                                            sessionStorage.setItem('currentUser', JSON.stringify(updatedUser));
                                                        }
                                                        setStatus({ type: 'success', message: '✅ Face ID sauvegardé !' });
                                                    } catch (e) {
                                                        console.error("Auto-save failed:", e);
                                                    }
                                                }

                                                setTimeout(() => {
                                                    stopWebcam();
                                                    resetFaceMeshStates();
                                                    setFaceIdScanPhase('idle');
                                                    setScanProgress(0);
                                                    if (!editingAdmin) {
                                                        setStatus({ type: 'success', message: '✅ Face ID configuré' });
                                                    }
                                                    setTimeout(() => setStatus(null), 3000);
                                                }, 2000);
                                            }, 500);
                                        }
                                    } else {
                                        setScanMessage('Regardez bien la caméra...');
                                    }
                                } else {
                                    // Feedback if challenge not met
                                    // This was causing the 35% cap.
                                    // We'll allow it to drift up slightly but the main progress is triggered by challenges.
                                    setScanProgress(prev => {
                                        // Cap based on current challenge to prevent overflow before completion
                                        let cap = 35;
                                        if (headChallenge === 'center') cap = 35;
                                        if (headChallenge === 'left') cap = 55;
                                        if (headChallenge === 'right') cap = 75;

                                        return Math.min(prev + 0.2, cap);
                                    });
                                }
                            } else {
                                const ctx = meshCanvas.getContext('2d');
                                ctx.clearRect(0, 0, meshCanvas.width, meshCanvas.height);
                                setScanMessage('Recherche de visage...');
                            }
                        } catch (err) {
                            console.error('Scan error:', err);
                        }
                    }
                }
            }, 100);

        } catch (error) {
            console.error('Face ID init error:', error);
            setFaceIdScanPhase('error');
            setScanMessage('Erreur d\'initialisation.');
            resetFaceMeshStates();
        }
    };


    const startWebcam = async (mode = 'photo') => {
        console.log("Starting webcam in mode:", mode);
        setWebcamMode(mode);
        setFaceIdScanPhase('idle');
        setScanProgress(0); // Reset scan progress
        try {
            // Robust Mobile Fallback Logic
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

            setWebcamStream(stream);
            setShowWebcam(true); // Show webcam UI

            // Ensure video element has playsinline (if reference exists immediately, though useEffect handles binding)
            if (videoRef.current) {
                videoRef.current.setAttribute('playsinline', 'true');
            }

            // If Face ID mode, start the scan automatically after a delay
            if (mode === 'faceId') {
                setTimeout(() => {
                    startFaceIdScan();
                }, 1000);
            }
        } catch (err) {
            setStatus({ type: 'error', message: "Impossible d'accéder à la caméra. Vérifiez les permissions." });
        }
    };

    // Capture Photo pour le mode photo simple
    const capturePhoto = async () => {
        if (videoRef.current && canvasRef.current) {
            const video = videoRef.current;
            const canvas = canvasRef.current;

            if (video.videoWidth === 0 || video.videoHeight === 0) {
                console.warn("Video dimensions not ready yet");
                return;
            }

            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;

            const context = canvas.getContext('2d');
            context.drawImage(video, 0, 0, canvas.width, canvas.height);

            const dataUrl = canvas.toDataURL('image/jpeg', 0.9);

            if (webcamMode === 'photo') {
                setNewAdmin(prev => ({ ...prev, photo: dataUrl }));
                stopWebcam();
                setStatus({ type: 'success', message: 'Photo capturée !' });
                setTimeout(() => setStatus(null), 2000);
            }
        }
    };

    // Fix Black Screen: Bind stream to video element when modal appears
    useEffect(() => {
        let retryCount = 0;
        const maxRetries = 10;

        const bindStream = () => {
            if (videoRef.current && webcamStream) {
                try {
                    videoRef.current.srcObject = webcamStream;
                    videoRef.current.onloadedmetadata = () => {
                        videoRef.current.play().catch(err => {
                            console.error("Video play error:", err);
                            if (retryCount < maxRetries) {
                                retryCount++;
                                setTimeout(bindStream, 100);
                            }
                        });
                    };
                } catch (err) {
                    console.error("Error binding stream:", err);
                }
            } else if (showWebcam && retryCount < maxRetries) {
                retryCount++;
                setTimeout(bindStream, 100);
            }
        };

        if (showWebcam && webcamStream) {
            setTimeout(bindStream, 50);
        }

        return () => {
            if (videoRef.current) {
                videoRef.current.onloadedmetadata = null;
            }
        };
    }, [showWebcam, webcamStream]);

    const stopWebcam = () => {
        // Nettoyer l'intervalle de scan
        if (scanIntervalRef.current) {
            clearInterval(scanIntervalRef.current);
            scanIntervalRef.current = null;
        }

        if (webcamStream) {
            webcamStream.getTracks().forEach(track => track.stop());
            setWebcamStream(null);
        }
        setShowWebcam(false);
        setFaceIdScanPhase('idle');
        setScanProgress(0);
    };



    const handleFileUpload = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setNewAdmin({ ...newAdmin, photo: reader.result });
            };
            reader.readAsDataURL(file);
        }
    };

    // Emission Form State
    const [formData, setFormData] = useState({
        firstName: '',
        lastName: '',
        description: '',
        email: '',
        date: '',
        organisme: 'Ministère du Numérique',
        ipfsHash: ''
    });
    const [generatedIpfsHash, setGeneratedIpfsHash] = useState('');
    const [revokeId, setRevokeId] = useState('');
    const [showRevokeModal, setShowRevokeModal] = useState(false);

    // Anti-duplicate system
    const [certificateCache, setCertificateCache] = useState({});
    const [showDuplicateModal, setShowDuplicateModal] = useState(false);
    const [duplicateData, setDuplicateData] = useState(null);



    // Balance State
    const [ethBalance, setEthBalance] = useState('0.00');
    const [ethPrice, setEthPrice] = useState(0);

    const handleRevoke = (e) => {
        e.preventDefault();
        if (!revokeId) return;
        setShowRevokeModal(true);
    };

    const confirmRevoke = async () => {
        setShowRevokeModal(false);
        setStatus({ type: 'loading', message: 'Révocation en cours...' });

        // Simulation de révocation (à remplacer par appel contrat)
        setTimeout(() => {
            setStatus({ type: 'success', message: `Certificat ${revokeId} révoqué avec succès.` });
            setRevokeId('');
            setTimeout(() => setStatus(null), 3000);
        }, 1500);
    };

    // Fetch statistics from blockchain
    // Charger les statistiques en temps réel depuis la blockchain
    // Fetch statistics from blockchain
    // Charger les statistiques en temps réel depuis la blockchain
    const fetchStats = async (contractInstance = contract) => {
        if (contractInstance) {
            try {
                // Récupérer tous les événements CertificatEnregistre depuis la blockchain
                const pastEvents = await contractInstance.getPastEvents('CertificatEnregistre', {
                    fromBlock: 0,
                    toBlock: 'latest'
                });

                console.log('\u00c9vénements blockchain chargés:', pastEvents.length);

                // Convertir les événements en format lisible
                const formattedEvents = pastEvents.map(event => ({
                    idUnique: event.returnValues.idUnique,
                    hashDocument: event.returnValues.hashDocument,
                    issuedAt: event.returnValues.issuedAt.toString(), // Convertir BigInt en String
                    timestamp: new Date(Number(event.returnValues.issuedAt) * 1000),
                    blockNumber: event.blockNumber.toString() // Convertir BigInt en String
                })).reverse(); // Plus récent en premier

                // Mettre à jour les événements si on n'en a pas encore
                if (events.length === 0 && formattedEvents.length > 0) {
                    // Charger les détails de chaque certificat
                    const eventsWithDetails = await Promise.all(
                        formattedEvents.slice(0, 10).map(async (evt) => {
                            try {
                                const cert = await contractInstance.methods.getCertificat(evt.idUnique).call();
                                return {
                                    ...evt,
                                    beneficiaire: cert.nomBeneficiaire,
                                    motif: cert.titreCertificat
                                };
                            } catch (e) {
                                return evt;
                            }
                        })
                    );
                    setEvents(eventsWithDetails);
                }

                setStats({
                    emis: pastEvents.length,
                    total: pastEvents.length,
                    lastEmission: formattedEvents.length > 0 ? formattedEvents[0].timestamp : null
                });
            } catch (error) {
                console.error("Erreur chargement stats blockchain:", error);
                // Fallback sur les events locaux
                setStats({
                    emis: events.length,
                    total: events.length,
                    lastEmission: events.length > 0 ? events[0].timestamp : null
                });
            }
        }
    };



    const fetchBalance = async (address) => {
        if (window.ethereum && address) {
            const web3 = new Web3(window.ethereum);
            try {
                // Fetch ETH Balance
                const balanceWei = await web3.eth.getBalance(address);
                const balanceEth = web3.utils.fromWei(balanceWei, 'ether');
                setEthBalance(parseFloat(balanceEth).toFixed(4));

                // Fetch ETH Price (CoinGecko API)
                const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd');
                const data = await response.json();
                setEthPrice(data.ethereum.usd);
            } catch (error) {
                console.error("Error fetching balance/price:", error);
            }
        }
    };

    useEffect(() => {
        if (account) {
            fetchBalance(account);
            const interval = setInterval(() => fetchBalance(account), 30000); // Update every 30s
            return () => clearInterval(interval);
        }
    }, [account]);

    // Sauvegarder events dans localStorage quand ils changent
    useEffect(() => {
        if (events.length > 0) {
            localStorage.setItem('dashboardEvents', JSON.stringify(events));
        }
    }, [events]);

    // Sauvegarder stats dans localStorage quand elles changent
    useEffect(() => {
        if (stats.emis > 0 || stats.lastEmission) {
            localStorage.setItem('dashboardStats', JSON.stringify(stats));
        }
    }, [stats]);

    // Charger les données blockchain automatiquement quand le contrat est connecté
    useEffect(() => {
        if (contract && account) {
            console.log('Contrat connecté, chargement des données blockchain...');
            setIsLoadingData(true);
            fetchStats().finally(() => setIsLoadingData(false));

            // Rafraîchir les stats toutes les 30 secondes
            const statsInterval = setInterval(() => {
                fetchStats();
            }, 30000);

            return () => clearInterval(statsInterval);
        }
    }, [contract, account]);

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    // Auto-reconnect MetaMask on page load
    useEffect(() => {
        const reconnectMetaMask = async () => {
            const wasConnected = localStorage.getItem('metamaskConnected');
            const savedAccount = localStorage.getItem('metamaskAccount');

            if (wasConnected === 'true' && window.ethereum) {
                try {
                    try {
                        // FORCE connection attempt if we were connected
                        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });

                        if (accounts.length > 0) {
                            // If saved account matches one of the authorized accounts, use it
                            // Otherwise use the first available one
                            const accountToUse = (savedAccount && accounts.some(a => a.toLowerCase() === savedAccount.toLowerCase()))
                                ? savedAccount
                                : accounts[0];

                            setAccount(accountToUse);

                            if (ADMIN_ADDRESS && accountToUse.toLowerCase() === ADMIN_ADDRESS.toLowerCase()) {
                                setIsAdmin(true);
                                const web3 = new Web3(window.ethereum); // Create web3 instance here as it was missing in this specific scope if we remove the previous lines
                                const contractInstance = new web3.eth.Contract(CONTRACT_ABI, CONTRACT_ADDRESS);
                                setContract(contractInstance);
                                await fetchBalance(accountToUse);
                            }
                        }
                    } catch (error) {
                        console.error("Auto-reconnect error:", error);
                        // If user rejects or error, we might want to clear storage or just stay disconnected
                        // But for "persistence", we just log it.
                    }
                } catch (error) {
                    console.error("Auto-reconnect error:", error);
                }
            }
        };

        reconnectMetaMask();
    }, []);

    useEffect(() => {
        if (window.ethereum) {
            window.ethereum.on('accountsChanged', (accounts) => {
                if (accounts.length > 0) {
                    setAccount(accounts[0]);
                    localStorage.setItem('metamaskAccount', accounts[0]);
                } else {
                    handleDisconnect();
                }
            });
        }
    }, []);

    const connectWallet = async () => {
        // Détecter si on est sur mobile
        const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

        if (window.ethereum) {
            try {
                setStatus({ type: 'loading', message: 'Connexion en cours...' });

                // 1. Demander la connexion au compte
                let accounts;
                try {
                    accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
                } catch (accountError) {
                    console.error("Erreur demande compte:", accountError);
                    setStatus({ type: 'error', message: 'Connexion refusée par l\'utilisateur.' });
                    return;
                }

                if (!accounts || accounts.length === 0) {
                    setStatus({ type: 'error', message: 'Aucun compte détecté. Veuillez vous connecter à MetaMask.' });
                    return;
                }

                const currentAccount = accounts[0];
                console.log("Compte connecté:", currentAccount);

                // 2. Vérifier et changer de réseau si nécessaire
                let chainId;
                try {
                    chainId = await window.ethereum.request({ method: 'eth_chainId' });
                    console.log("Chain ID actuel:", chainId, "Attendu:", NETWORK_CONFIG.CHAIN_ID_HEX);
                } catch (chainError) {
                    console.error("Erreur récupération chainId:", chainError);
                    // Sur mobile, parfois le chainId n'est pas immédiatement disponible
                    // On continue quand même
                    chainId = null;
                }

                if (chainId && chainId !== NETWORK_CONFIG.CHAIN_ID_HEX) {
                    try {
                        setStatus({ type: 'loading', message: 'Changement de réseau vers GouvChain...' });
                        await window.ethereum.request({
                            method: 'wallet_switchEthereumChain',
                            params: [{ chainId: NETWORK_CONFIG.CHAIN_ID_HEX }],
                        });
                    } catch (switchError) {
                        // Si le réseau n'existe pas, l'ajouter
                        if (switchError.code === 4902 || switchError.message?.includes('wallet_addEthereumChain')) {
                            try {
                                setStatus({ type: 'loading', message: 'Ajout du réseau GouvChain...' });
                                await window.ethereum.request({
                                    method: 'wallet_addEthereumChain',
                                    params: [
                                        {
                                            chainId: NETWORK_CONFIG.CHAIN_ID_HEX,
                                            chainName: NETWORK_CONFIG.NAME,
                                            rpcUrls: [NETWORK_CONFIG.RPC_URL],
                                            nativeCurrency: {
                                                name: NETWORK_CONFIG.SYMBOL,
                                                symbol: NETWORK_CONFIG.SYMBOL,
                                                decimals: 18,
                                            },
                                            blockExplorerUrls: [NETWORK_CONFIG.BLOCK_EXPLORER],
                                        },
                                    ],
                                });
                            } catch (addError) {
                                console.error("Erreur ajout réseau:", addError);
                                // Sur mobile, on continue quand même - le réseau sera ajouté manuellement
                                if (!isMobileDevice) {
                                    setStatus({ type: 'error', message: "Impossible d'ajouter le réseau. Veuillez le configurer manuellement dans MetaMask." });
                                    return;
                                }
                            }
                        } else if (switchError.code === 4001) {
                            setStatus({ type: 'error', message: 'Changement de réseau refusé par l\'utilisateur.' });
                            return;
                        } else {
                            console.error("Erreur changement réseau:", switchError);
                            // Sur mobile, on continue quand même
                            if (!isMobileDevice) {
                                setStatus({ type: 'error', message: 'Veuillez changer de réseau pour GouvChain Testnet.' });
                                return;
                            }
                        }
                    }

                    // IMPORTANT: Après changement de réseau, attendre et re-demander les comptes
                    if (isMobileDevice) {
                        setStatus({ type: 'loading', message: 'Synchronisation après changement de réseau...' });
                        await new Promise(resolve => setTimeout(resolve, 1500)); // Attendre 1.5s
                    }
                }

                // Re-demander les comptes après le changement de réseau (crucial pour mobile)
                let finalAccount = currentAccount;
                try {
                    const refreshedAccounts = await window.ethereum.request({ method: 'eth_accounts' });
                    if (refreshedAccounts && refreshedAccounts.length > 0) {
                        finalAccount = refreshedAccounts[0];
                        console.log("Compte après refresh:", finalAccount);
                    } else {
                        // Si pas de compte, re-demander l'autorisation
                        const newAccounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
                        if (newAccounts && newAccounts.length > 0) {
                            finalAccount = newAccounts[0];
                            console.log("Compte après nouvelle demande:", finalAccount);
                        }
                    }
                } catch (refreshError) {
                    console.error("Erreur refresh comptes:", refreshError);
                    // Continuer avec le compte initial
                }

                setAccount(finalAccount);

                // Créer Web3 avec vérification de connexion
                let web3 = new Web3(window.ethereum);

                // Sur mobile, vérifier que la connexion fonctionne
                if (isMobileDevice) {
                    try {
                        // Test simple pour vérifier que Web3 fonctionne
                        const testChainId = await web3.eth.getChainId();
                        console.log("Chain ID vérifié sur mobile:", testChainId);

                        // Vérifier si on est sur le bon réseau
                        if (Number(testChainId) !== NETWORK_CONFIG.CHAIN_ID) {
                            console.warn("Réseau incorrect sur mobile, chainId:", testChainId);
                            setStatus({ type: 'loading', message: 'Configuration du réseau GouvChain...' });

                            // Essayer de forcer le changement de réseau
                            try {
                                await window.ethereum.request({
                                    method: 'wallet_switchEthereumChain',
                                    params: [{ chainId: NETWORK_CONFIG.CHAIN_ID_HEX }],
                                });
                            } catch (e) {
                                console.log("Changement réseau échoué, ajout du réseau...");
                                try {
                                    await window.ethereum.request({
                                        method: 'wallet_addEthereumChain',
                                        params: [{
                                            chainId: NETWORK_CONFIG.CHAIN_ID_HEX,
                                            chainName: NETWORK_CONFIG.NAME,
                                            rpcUrls: [NETWORK_CONFIG.RPC_URL],
                                            nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
                                        }],
                                    });
                                } catch (addErr) {
                                    console.error("Impossible d'ajouter le réseau:", addErr);
                                }
                            }

                            // Recréer Web3 après changement
                            await new Promise(resolve => setTimeout(resolve, 1000));
                            web3 = new Web3(window.ethereum);
                        }
                    } catch (testError) {
                        console.error("Erreur test Web3 sur mobile:", testError);
                        // Continuer quand même
                    }
                }

                // Vérification admin avec message plus clair
                if (ADMIN_ADDRESS && finalAccount.toLowerCase() !== ADMIN_ADDRESS.toLowerCase()) {
                    setIsAdmin(false);
                    setStatus({ type: 'error', message: `Accès refusé. Ce compte (${finalAccount.substring(0, 6)}...${finalAccount.substring(38)}) n'est pas l'administrateur autorisé.` });
                    return;
                }

                setIsAdmin(true);
                setStatus({ type: 'loading', message: 'Initialisation du contrat...' });

                // Stocker la connexion dans localStorage
                localStorage.setItem('metamaskConnected', 'true');
                localStorage.setItem('metamaskAccount', finalAccount);

                try {
                    const contractInstance = new web3.eth.Contract(CONTRACT_ABI, CONTRACT_ADDRESS);
                    setContract(contractInstance);

                    // Vérifier que le contrat est accessible
                    try {
                        const authority = await contractInstance.methods.autorite().call();
                        console.log("Contrat vérifié, autorité:", authority);
                    } catch (contractCheckError) {
                        console.warn("Impossible de vérifier le contrat:", contractCheckError);
                    }

                    // Fetch stats immediately after connection using the new instance
                    await fetchStats(contractInstance);
                    setStatus({ type: 'success', message: 'Connecté avec succès !' });
                    setTimeout(() => setStatus(null), 3000);
                } catch (contractError) {
                    console.error("Contract init error:", contractError);
                    setStatus({ type: 'error', message: 'Erreur d\'initialisation du contrat. Vérifiez le réseau.' });
                }

                // Fetch balance immediately after connection
                await fetchBalance(finalAccount);

            } catch (error) {
                console.error("Connection error:", error);
                setStatus({ type: 'error', message: `Échec de la connexion: ${error.message || 'Erreur inconnue'}` });
            }
        } else if (isMobileDevice) {
            // Sur mobile sans MetaMask browser intégré, rediriger vers l'app MetaMask
            const currentUrl = window.location.href;
            const metamaskDeepLink = `https://metamask.app.link/dapp/${currentUrl.replace(/^https?:\/\//, '')}`;
            window.location.href = metamaskDeepLink;
        } else {
            setStatus({ type: 'error', message: 'Veuillez installer MetaMask !' });
        }
    };

    const handleDisconnect = () => {
        setAccount(null);
        setIsAdmin(false);
        setContract(null);
        setStatus(null);
        setEvents([]);
        setStats({ emis: 0, total: 0, lastEmission: null });
        setEthBalance('0.00');

        // Nettoyer localStorage - données de connexion et du dashboard
        localStorage.removeItem('metamaskConnected');
        localStorage.removeItem('metamaskAccount');
        localStorage.removeItem('dashboardEvents');
        localStorage.removeItem('dashboardStats');

        console.log('Déconnexion: toutes les données ont été effacées');
    };

    // Generate unique hash for certificate data
    const generateCertificateHash = (data) => {
        const web3 = new Web3(window.ethereum || 'http://localhost:7545');
        const hashString = `${data.firstName} ${data.lastName}-${data.description}-${data.date}-${data.organisme}`.toLowerCase().trim();
        return web3.utils.sha3(hashString);
    };

    // Check if certificate is duplicate
    const checkDuplicate = (data) => {
        const hash = generateCertificateHash(data);
        return certificateCache[hash] || null;
    };

    // Confirm duplicate creation
    const confirmDuplicateCreation = async () => {
        setShowDuplicateModal(false);
        if (duplicateData) {
            await proceedWithCertificateCreation(duplicateData, true);
        }
    };

    // Main certificate creation logic (renamed from generateAndUploadCertificate)
    const proceedWithCertificateCreation = async (data, forceDuplicate = false) => {
        if (!data.firstName || !data.lastName || !data.description || !data.date || !data.organisme) {
            setStatus({ type: 'error', message: 'Veuillez remplir tous les champs obligatoires.' });
            return;
        }

        // Check for duplicates (unless forced)
        if (!forceDuplicate) {
            const existingCert = checkDuplicate(data);
            if (existingCert) {
                setDuplicateData(data);
                setShowDuplicateModal(true);
                return;
            }
        }

        setStatus({ type: 'loading', message: 'Génération du certificat et upload IPFS...' });

        // Helper to load image
        const loadImage = (url) => {
            return new Promise((resolve, reject) => {
                const img = new Image();
                img.crossOrigin = 'Anonymous';
                img.src = url;
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    canvas.width = img.width;
                    canvas.height = img.height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0);
                    resolve(canvas.toDataURL('image/png'));
                };
                img.onerror = reject;
            });
        };

        try {
            // Génération du PDF
            const doc = new jsPDF({
                orientation: "landscape",
                unit: "mm",
                format: "a4"
            });

            const width = doc.internal.pageSize.getWidth();
            const height = doc.internal.pageSize.getHeight();
            // Utiliser le hash du contenu comme ID Unique pour qu'il corresponde à la blockchain
            // Cela permet à la vérification par ID de fonctionner (LandingPage attend le hash du contenu ou l'ID hex)
            const uniqueId = generateCertificateHash(data);

            // --- DESIGN ---
            // Background White
            doc.setFillColor(255, 255, 255);
            doc.rect(0, 0, width, height, "F");

            // Decorative Circles (Top Left)
            doc.setDrawColor(37, 99, 235);
            doc.setLineWidth(0.5);
            doc.circle(0, 0, 40, 'S');
            doc.circle(0, 0, 50, 'S');
            doc.circle(0, 0, 60, 'S');

            // Decorative Circles (Top Right)
            doc.circle(width, 0, 40, 'S');
            doc.circle(width, 0, 50, 'S');
            doc.circle(width, 0, 60, 'S');

            // Logo (Top Center)
            try {
                const logoData = await loadImage('/logo certificat.png');
                doc.addImage(logoData, 'PNG', width / 2 - 15, 10, 30, 30);
            } catch (e) {
                console.warn("Logo load failed", e);
            }

            // Title
            doc.setTextColor(30, 58, 138);
            doc.setFont("times", "bold");
            doc.setFontSize(32);
            doc.text("CERTIFICAT DE PRÉSENCE", width / 2, 50, { align: "center" });

            // Separator Line
            doc.setDrawColor(30, 58, 138);
            doc.setLineWidth(0.5);
            const separatorWidth = 80;
            doc.line(width / 2 - separatorWidth / 2, 55, width / 2 + separatorWidth / 2, 55);

            // "Délivré à :"
            doc.setFont("helvetica", "normal");
            doc.setFontSize(11);
            doc.setTextColor(100, 116, 139);
            doc.text("DÉLIVRÉ À :", width / 2, 65, { align: "center" });

            // Beneficiary Name
            doc.setFont("helvetica", "bold");
            doc.setFontSize(26);
            doc.setTextColor(30, 58, 138);
            doc.text(`${data.firstName} ${data.lastName}`, width / 2, 80, { align: "center" });

            // Body Text - Format exact du preview (2 LIGNES)
            const bodyY = 100;
            doc.setFontSize(14);

            // LIGNE 1 : "Ce certificat atteste... à [Motif],"
            // Partie normale
            doc.setFont("helvetica", "normal");
            doc.setTextColor(71, 85, 105);
            const line1Normal = "Ce certificat atteste que le titulaire a participé avec succès à ";
            const line1NormalWidth = doc.getTextWidth(line1Normal);

            // Partie en gras (motif)
            doc.setFont("helvetica", "bold");
            doc.setTextColor(15, 23, 42);
            const line1Bold = data.description + ",";
            const line1BoldWidth = doc.getTextWidth(line1Bold);

            // Calculer la position de départ pour centrer toute la ligne
            const line1TotalWidth = line1NormalWidth + line1BoldWidth;
            const line1StartX = (width - line1TotalWidth) / 2;

            // Dessiner la ligne 1
            doc.setFont("helvetica", "normal");
            doc.setTextColor(71, 85, 105);
            doc.text(line1Normal, line1StartX, bodyY);

            doc.setFont("helvetica", "bold");
            doc.setTextColor(15, 23, 42);
            doc.text(line1Bold, line1StartX + line1NormalWidth, bodyY);

            // LIGNE 2 : "organisé par [Organisme]."
            const line2Y = bodyY + 8;

            // Partie normale
            doc.setFont("helvetica", "normal");
            doc.setTextColor(71, 85, 105);
            const line2Normal = "organisé par ";
            const line2NormalWidth = doc.getTextWidth(line2Normal);

            // Partie en gras (organisme)
            doc.setFont("helvetica", "bold");
            doc.setTextColor(15, 23, 42);
            const line2Bold = data.organisme + ".";
            const line2BoldWidth = doc.getTextWidth(line2Bold);

            // Calculer la position de départ pour centrer toute la ligne
            const line2TotalWidth = line2NormalWidth + line2BoldWidth;
            const line2StartX = (width - line2TotalWidth) / 2;

            // Dessiner la ligne 2
            doc.setFont("helvetica", "normal");
            doc.setTextColor(71, 85, 105);
            doc.text(line2Normal, line2StartX, line2Y);

            doc.setFont("helvetica", "bold");
            doc.setTextColor(15, 23, 42);
            doc.text(line2Bold, line2StartX + line2NormalWidth, line2Y);

            // Footer Note
            doc.setFont("helvetica", "italic");
            doc.setFontSize(10);
            doc.setTextColor(148, 163, 184);
            doc.text("La présence est certifiée via la blockchain GouvChain, garantissant une authenticité irréfutable.", width / 2, line2Y + 14, { align: "center" });

            // Footer Section (Bottom)
            const footerY = height - 40;

            // Left: GouvChain Signature
            doc.setFont("times", "italic");
            doc.setFontSize(18);
            doc.setTextColor(30, 58, 138);
            doc.text("GouvChain", 40, footerY, { align: "center" });
            doc.setDrawColor(203, 213, 225);
            doc.setLineWidth(0.5);
            doc.line(20, footerY + 2, 60, footerY + 2);
            doc.setFont("helvetica", "bold");
            doc.setFontSize(8);
            doc.setTextColor(51, 65, 85);
            doc.text("DIRECTEUR DE L'ÉVÉNEMENT", 40, footerY + 7, { align: "center" });

            // Center: Date & ID
            doc.setFont("helvetica", "normal");
            doc.setFontSize(9);
            doc.setTextColor(148, 163, 184);
            doc.text("Délivré le", width / 2, footerY - 5, { align: "center" });
            doc.setFont("helvetica", "bold");
            doc.setFontSize(12);
            doc.setTextColor(30, 58, 138);

            // Format date en français
            const formattedDate = data.date ? new Date(data.date).toLocaleDateString('fr-FR', {
                day: 'numeric',
                month: 'long',
                year: 'numeric'
            }) : new Date().toLocaleDateString('fr-FR', {
                day: 'numeric',
                month: 'long',
                year: 'numeric'
            });
            doc.text(formattedDate, width / 2, footerY + 2, { align: "center" });

            doc.setFont("helvetica", "normal");
            doc.setFontSize(8);
            doc.setTextColor(148, 163, 184);
            doc.text("ID Unique", width / 2, footerY + 10, { align: "center" });
            // ID Unique
            doc.setFont("helvetica", "normal");
            doc.setFontSize(8);
            doc.setTextColor(148, 163, 184);
            doc.text("ID Unique", width / 2, footerY + 10, { align: "center" });

            doc.setFont("courier", "normal");
            doc.setFontSize(7); // Taille réduite pour afficher tout l'ID
            doc.setTextColor(71, 85, 105);

            // Afficher l'ID complet (0x...) pour permettre la vérification manuelle exacte
            doc.text(uniqueId, width / 2, footerY + 14, { align: "center" });

            // Right: QR Code - Pointe vers la page de vérification
            try {
                const verificationLink = `${APP_URL}/?verify=${uniqueId}`;
                const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(verificationLink)}&color=1e3a8a`;
                const qrImg = await loadImage(qrUrl);
                doc.addImage(qrImg, 'PNG', width - 60, footerY - 15, 30, 30);
                doc.setFont("helvetica", "bold");
                doc.setFontSize(7);
                doc.setTextColor(30, 58, 138);
                doc.text("Vérifier sur GouvChain", width - 45, footerY + 20, { align: "center" });
            } catch (e) {
                console.warn("QR load failed", e);
            }

            // Bottom Decorative Strip - gradient effect
            const stripHeight = 3;
            doc.setFillColor(30, 58, 138);
            doc.rect(0, height - stripHeight, width / 3, stripHeight, "F");
            doc.setFillColor(37, 99, 235);
            doc.rect(width / 3, height - stripHeight, width / 3, stripHeight, "F");
            doc.setFillColor(30, 58, 138);
            doc.rect((width / 3) * 2, height - stripHeight, width / 3, stripHeight, "F");

            // --- END DESIGN ---

            const pdfBlob = doc.output('blob');
            const pdfFile = new File([pdfBlob], `certificat_${data.firstName.replace(/\s+/g, '_')}_${data.lastName.replace(/\s+/g, '_')}.pdf`, { type: "application/pdf" });

            // 1. Upload sur IPFS d'abord (pour avoir le VRAI hash Pinata)
            setStatus({ type: 'loading', message: 'Upload temporaire sur IPFS (pour obtenir le hash)...' });
            let hash;
            try {
                hash = await uploadToIPFS(pdfFile);
            } catch (uploadError) {
                console.error("Erreur upload initial:", uploadError);
                setStatus({ type: 'error', message: "Impossible d'uploader sur IPFS." });
                return;
            }

            if (hash) {
                setGeneratedIpfsHash(hash);

                // 2. Enregistrer le certificat sur la blockchain
                if (contract && account) {
                    try {
                        setStatus({ type: 'loading', message: 'Enregistrement sur la blockchain (Veuillez confirmer)...' });

                        const result = await contract.methods.enregistrerCertificat(
                            `${data.firstName} ${data.lastName}`,
                            data.description,
                            data.date || new Date().toLocaleDateString(),
                            data.organisme,
                            hash
                        ).send({ from: account });

                        // Transaction réussie : on garde le fichier sur IPFS
                        setStatus({ type: 'success', message: 'Transaction confirmée ! Certificat finalisé.' });

                        const certId = result.events?.CertificatEnregistre?.returnValues?.idUnique || "0x" + Math.random().toString(16).substr(2, 64);

                        // 5. Envoyer l'email avec retentative
                        if (data.email) {
                            setStatus({ type: 'loading', message: 'Certificat enregistré ! Envoi de l\'email en cours...' });

                            const sendEmailWithRetry = async (retries = 3) => {
                                const emailParams = {
                                    to_name: `${data.firstName} ${data.lastName}`,
                                    to_email: data.email,
                                    certificate_link: `${APP_URL}/?verify=${hash}`, // Correction: use 'verify' parameter for auto-verification
                                    certificate_hash: hash,
                                    issue_date: new Date().toLocaleDateString('fr-FR')
                                };

                                for (let i = 0; i < retries; i++) {
                                    try {
                                        await emailjs.send(
                                            EMAILJS_CONFIG.SERVICE_ID,
                                            EMAILJS_CONFIG.TEMPLATE_ID,
                                            emailParams,
                                            EMAILJS_CONFIG.PUBLIC_KEY
                                        );
                                        return true; // Success
                                    } catch (err) {
                                        console.warn(`Tentative email ${i + 1}/${retries} échouée:`, err);
                                        if (i === retries - 1) throw err; // Throw on last failure
                                        await new Promise(res => setTimeout(res, 2000)); // Wait 2s before retry
                                    }
                                }
                            };

                            try {
                                await sendEmailWithRetry();
                                setStatus({ type: 'success', message: 'Certificat enregistré et Email envoyé avec succès !' });
                            } catch (emailError) {
                                console.error("Erreur fatale envoi email:", emailError);
                                setStatus({ type: 'success', message: 'Certificat enregistré, mais échec de l\'envoi de l\'email (Connexion?).' });
                            }
                        } else {
                            setStatus({ type: 'success', message: 'Certificat enregistré avec succès (sans email).' });
                        }


                        // Save to cache
                        const certHash = generateCertificateHash(data);
                        setCertificateCache(prev => ({
                            ...prev,
                            [certHash]: {
                                ipfsHash: hash,
                                certId: certId,
                                timestamp: new Date().toISOString(),
                                data: data
                            }
                        }));

                        // Ajouter à l'historique
                        const newEvent = {
                            idUnique: certId,
                            beneficiaire: `${data.firstName} ${data.lastName}`,
                            motif: data.description,
                            timestamp: new Date()
                        };
                        setEvents(prev => [newEvent, ...prev]);

                        // Reset du formulaire
                        setFormData({
                            firstName: '',
                            lastName: '',
                            description: '',
                            email: '',
                            date: '',
                            organisme: 'Ministère du Numérique',
                            ipfsHash: ''
                        });
                        setGeneratedIpfsHash('');

                        setStatus({ type: 'success', message: `Certificat enregistré avec succès ! ID: ${certId.substring(0, 10)}...` });
                    } catch (contractError) {
                        console.error("Échec enregistrement certificat:", contractError);

                        // ROLLBACK: Supprimer le fichier de IPFS car la transaction a échoué/annulée
                        setStatus({ type: 'loading', message: 'Annulation : Suppression du fichier IPFS...' });
                        try {
                            await unpinFromIPFS(hash);
                            setStatus({ type: 'error', message: 'Transaction annulée. Fichier retiré de IPFS.' });
                        } catch (unpinError) {
                            console.error("Erreur lors de l'unpin IPFS:", unpinError);
                            setStatus({ type: 'error', message: 'Transaction annulée. Erreur lors de la suppression du fichier IPFS.' });
                        }
                        return;
                    }
                } else {
                    setStatus({ type: 'success', message: 'Document généré et sécurisé sur IPFS ! Connectez MetaMask pour l\'enregistrer.' });
                }
            } else {
                throw new Error("Echec de l'upload IPFS");
            }

        } catch (error) {
            console.error("Erreur génération/upload:", error);
            setStatus({ type: 'error', message: `Erreur: ${error.message || 'Problème lors de la génération'}` });
        }
    };

    // Wrapper function for generateAndUploadCertificate
    const generateAndUploadCertificate = async () => {
        await proceedWithCertificateCreation(formData, false);
    };

    const handleGeneratePDF = () => {
        alert("Génération du PDF en cours... (Fonctionnalité à implémenter avec jsPDF)");
    };

    const copyAddress = () => {
        if (account) {
            navigator.clipboard.writeText(account);
            alert("Adresse copiée !");
        }
    };

    // Check if user is logged in
    const isLoggedIn = sessionStorage.getItem('isLoggedIn') === 'true';

    // Redirect to login if not logged in
    if (!isLoggedIn) {
        window.location.href = '/login';
        return null;
    }

    return (
        <div className="min-h-screen bg-sidebar flex font-sans selection:bg-primary/10">
            {/* Sidebar Aceternity */}
            {/* Sidebar Aceternity */}
            {/* Mobile Overlay */}
            {sidebarOpen && (
                <div
                    className="fixed inset-0 bg-black/50 z-40 lg:hidden"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            <motion.aside
                initial={{ width: 300, x: -300 }}
                animate={{
                    width: sidebarOpen ? 300 : 80,
                    x: isMobile ? (sidebarOpen ? 0 : -300) : 0,
                    // On mobile, if open -> x: 0, if closed -> x: -300
                    // On desktop, always x: 0
                }}
                transition={{ duration: 0.3, ease: "easeInOut" }}
                className={`bg-[#1e3a8a] border-r border-blue-800 h-screen fixed top-0 left-0 flex flex-col z-50 shadow-xl
                    ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
                    lg:relative lg:block
                `}
                style={{
                    position: 'fixed',
                }}
            >
                {/* Logo Section */}
                {/* Logo Section */}
                <div className={`h-20 flex items-center border-b border-blue-800 ${sidebarOpen ? 'px-6' : 'justify-center'}`}>
                    {sidebarOpen ? (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="flex items-center gap-3 w-full"
                        >
                            <div className="bg-white/10 p-2 rounded-xl flex-shrink-0">
                                <img src="/logo.png" alt="Logo" className="h-8 w-auto brightness-0 invert" />
                            </div>
                            <span className="font-bold text-xl text-white tracking-tight">GouvChain</span>
                        </motion.div>
                    ) : (
                        <div className="bg-white/10 p-2 rounded-xl">
                            <img src="/logo.png" alt="Logo" className="h-8 w-auto brightness-0 invert object-contain" />
                        </div>
                    )}
                </div>

                {/* Navigation Links */}
                <div className="flex-1 py-8 px-4 space-y-2 overflow-y-auto overflow-x-hidden">
                    <button
                        onClick={() => setActiveTab('dashboard')}
                        className={`w-full flex items-center ${sidebarOpen ? 'gap-3 px-4' : 'justify-center px-2'} py-3 rounded-xl text-sm font-medium transition-all duration-200 ${activeTab === 'dashboard'
                            ? 'bg-white/20 text-white shadow-md'
                            : 'text-blue-200 hover:bg-white/10 hover:text-white'
                            }`}
                    >
                        <LayoutDashboard className="h-5 w-5 flex-shrink-0" />
                        {sidebarOpen && (
                            <motion.span
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="whitespace-nowrap"
                            >
                                Tableau de bord
                            </motion.span>
                        )}
                    </button>

                    <button
                        onClick={() => setActiveTab('issue')}
                        className={`w-full flex items-center ${sidebarOpen ? 'gap-3 px-4' : 'justify-center px-2'} py-3 rounded-xl text-sm font-medium transition-all duration-200 ${activeTab === 'issue'
                            ? 'bg-white/20 text-white shadow-md'
                            : 'text-blue-200 hover:bg-white/10 hover:text-white'
                            }`}
                    >
                        <FileCheck className="h-5 w-5 flex-shrink-0" />
                        {sidebarOpen && (
                            <motion.span
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="whitespace-nowrap"
                            >
                                Émettre Certificat
                            </motion.span>
                        )}
                    </button>

                    <button
                        onClick={() => setActiveTab('admins')}
                        className={`w-full flex items-center ${sidebarOpen ? 'gap-3 px-4' : 'justify-center px-2'} py-3 rounded-xl text-sm font-medium transition-all duration-200 ${activeTab === 'admins'
                            ? 'bg-white/20 text-white shadow-md'
                            : 'text-blue-200 hover:bg-white/10 hover:text-white'
                            }`}
                    >
                        <Users className="h-5 w-5 flex-shrink-0" />
                        {sidebarOpen && (
                            <motion.span
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="whitespace-nowrap"
                            >
                                Admins
                            </motion.span>
                        )}
                    </button>
                </div>

                {/* User Profile Section */}
                <div className="p-4 border-t border-blue-800">
                    <div className={`flex items-center ${sidebarOpen ? 'gap-3' : 'justify-center'}`}>
                        {currentUser && (
                            <>
                                <div className="h-10 w-10 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold flex-shrink-0 overflow-hidden">
                                    {currentUser.photo ? (
                                        <img src={currentUser.photo} alt="Profile" className="h-full w-full object-cover" />
                                    ) : (
                                        `${currentUser.firstName[0]}${currentUser.lastName[0]}`
                                    )}
                                </div>
                                {sidebarOpen && (
                                    <motion.div
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        className="flex flex-col overflow-hidden"
                                    >
                                        <span className="text-sm font-medium text-white truncate">
                                            {`${currentUser.firstName} ${currentUser.lastName}`}
                                        </span>
                                        <span className="text-xs text-blue-300 truncate">
                                            {account ? `${account.substring(0, 6)}...${account.substring(38)}` : 'Non connecté'}
                                        </span>
                                    </motion.div>
                                )}
                            </>
                        )}
                    </div>
                </div>

                {/* Logout Button */}
                <div className="p-4 border-t border-blue-800">
                    <button
                        onClick={handleLogout}
                        className={`w-full flex items-center ${sidebarOpen ? 'gap-3 px-4' : 'justify-center px-2'} py-3 rounded-xl text-sm font-medium text-red-300 hover:bg-red-500/10 hover:text-red-200 transition-all duration-200`}
                    >
                        <LogOut className="h-5 w-5 flex-shrink-0" />
                        {sidebarOpen && (
                            <motion.span
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="whitespace-nowrap"
                            >
                                Déconnexion
                            </motion.span>
                        )}
                    </button>
                </div>
            </motion.aside>

            {/* Main Content */}
            <motion.div
                className="flex-1 flex flex-col min-w-0 bg-background relative w-full"
                animate={{
                    marginLeft: isMobile ? 0 : (sidebarOpen ? 300 : 80)
                }}
                transition={{ duration: 0.3, ease: "easeInOut" }}
            >
                {/* Header */}
                <header className="h-20 border-b border-blue-200/30 bg-gradient-to-r from-slate-50 via-blue-50/50 to-slate-50 backdrop-blur-xl sticky top-0 z-30 px-4 md:px-8 flex items-center justify-between shadow-lg shadow-blue-100/20">
                    <div className="flex items-center gap-5">
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setSidebarOpen(!sidebarOpen)}
                            className="h-10 w-10 rounded-xl hover:bg-blue-100 text-blue-900 hover:text-blue-600 transition-all duration-200 hover:scale-105 shadow-sm hover:shadow-md"
                        >
                            <PanelLeft className="h-5 w-5" />
                        </Button>
                        <div className="hidden md:flex items-center gap-2 text-sm bg-gradient-to-r from-blue-600 to-blue-700 px-5 py-2.5 rounded-xl shadow-lg shadow-blue-500/20 border border-blue-400/30">
                            <span className="text-blue-100 font-medium">Admin</span>
                            <ChevronRight className="h-4 w-4 text-blue-200/70" />
                            <span className="text-white font-bold">
                                {activeTab === 'dashboard' ? 'Vue d\'ensemble' :
                                    activeTab === 'issue' ? 'Émission' : 'Gestion Admins'}
                            </span>
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        <div className="hidden xl:flex items-center gap-4 text-sm bg-white/80 border border-blue-200/50 px-5 py-2.5 rounded-xl shadow-md backdrop-blur-sm hover:shadow-lg hover:border-blue-300/60 transition-all duration-200">
                            <div className="flex items-center gap-2.5 text-slate-700">
                                <div className="p-1.5 bg-blue-100 rounded-lg">
                                    <Clock className="h-4 w-4 text-blue-700" />
                                </div>
                                <span className="font-semibold">
                                    {currentTime.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                                </span>
                            </div>
                            <div className="w-px h-5 bg-gradient-to-b from-transparent via-blue-300 to-transparent"></div>
                            <span className="font-mono font-bold text-blue-900 tabular-nums">
                                {currentTime.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                        </div>

                        <div className="flex items-center gap-3">
                            {account ? (
                                <>
                                    <div
                                        className="flex items-center gap-3 bg-gradient-to-r from-emerald-50 to-green-50 border-2 border-emerald-300/50 hover:border-emerald-400 transition-all duration-200 px-4 py-2.5 rounded-xl cursor-pointer shadow-md shadow-emerald-100/50 hover:shadow-lg hover:shadow-emerald-200/50 group hover:scale-[1.02]"
                                        onClick={copyAddress}
                                    >
                                        <div className="relative flex h-2.5 w-2.5">
                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75"></span>
                                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500 shadow-lg shadow-emerald-500/50"></span>
                                        </div>
                                        <div className="bg-white rounded-lg p-1 flex items-center justify-center">
                                            <img src="/Metmask.png" alt="MetaMask" className="h-4 w-4" />
                                        </div>
                                        <span className="text-sm font-bold text-emerald-700 group-hover:text-emerald-600 transition-colors">Connecté</span>
                                    </div>

                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={handleDisconnect}
                                        className="h-10 w-10 rounded-xl text-slate-600 hover:text-red-600 hover:bg-red-50 border border-transparent hover:border-red-200 shadow-sm hover:shadow-md transition-all duration-200"
                                    >
                                        <LogOut className="h-5 w-5" />
                                    </Button>
                                </>
                            ) : (
                                <div className="flex items-center gap-3">
                                    <div className="flex items-center gap-3 bg-gradient-to-r from-red-50 to-orange-50 border-2 border-red-200/50 px-4 py-2.5 rounded-xl shadow-md">
                                        <div className="relative flex h-2.5 w-2.5">
                                            <span className="animate-pulse relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500 shadow-lg shadow-red-500/50"></span>
                                        </div>
                                        <span className="text-sm font-bold text-red-700">Pas connecté</span>
                                    </div>
                                    <Button
                                        onClick={connectWallet}
                                        className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white gap-2.5 px-3 md:px-5 py-2.5 rounded-xl shadow-lg shadow-blue-500/30 hover:shadow-xl hover:shadow-blue-600/40 transition-all duration-200 hover:scale-[1.02] font-semibold border border-blue-500/30"
                                    >
                                        <div className="bg-white rounded-lg p-1 flex items-center justify-center">
                                            <img src="/Metmask.png" alt="MetaMask" className="h-4 w-4" />
                                        </div>
                                        <span className="hidden sm:inline">Connecter MetaMask</span>
                                        <span className="sm:hidden">Connecter</span>
                                    </Button>
                                </div>
                            )}
                        </div>
                    </div>
                </header>

                {/* Content Body */}
                <main className="flex-1 p-4 md:p-8 overflow-y-auto">
                    {/* Date & Time for Mobile/Tablet (Hidden on Desktop XL) */}
                    <div className="xl:hidden flex flex-wrap items-center justify-between gap-3 bg-white/60 border border-blue-200/50 px-4 py-3 rounded-xl mb-6 backdrop-blur-sm shadow-sm">
                        <div className="flex items-center gap-2.5 text-slate-700">
                            <div className="p-1.5 bg-blue-100 rounded-lg">
                                <Clock className="h-4 w-4 text-blue-700" />
                            </div>
                            <span className="font-semibold text-sm">
                                {currentTime.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                            </span>
                        </div>
                        <span className="font-mono font-bold text-blue-900 tabular-nums text-sm bg-blue-50 px-2 py-1 rounded-md border border-blue-100">
                            {currentTime.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                    </div>

                    <AnimatePresence mode="wait">
                        {activeTab === 'dashboard' && (
                            <motion.div
                                key="dashboard"
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                className="space-y-8"
                            >
                                {/* Stats Cards */}
                                <h1 className="text-3xl font-bold text-blue-900 mb-6">
                                    Bonjour, {currentUser?.firstName || 'Utilisateur'}
                                </h1>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                    <StatsCard
                                        title="Solde du Compte"
                                        value={`${ethBalance} ETH`}
                                        icon={<div className="h-6 w-6 text-white font-bold flex items-center justify-center">Ξ</div>}
                                        gradient="bg-blue-900"
                                        trend={`≈ $${(parseFloat(ethBalance) * ethPrice).toFixed(2)} USD`}
                                        details={currentUser?.walletAddress ? `Compte: ${currentUser.walletAddress.substring(0, 6)}...${currentUser.walletAddress.substring(38)}` : (localStorage.getItem('metamaskAccount') ? `Compte: ${localStorage.getItem('metamaskAccount').substring(0, 6)}...${localStorage.getItem('metamaskAccount').substring(38)}` : 'Non connecté')}
                                    />
                                    <StatsCard
                                        title="Total Documents Enregistrés"
                                        value={stats.emis}
                                        icon={<FileCheck className="h-6 w-6 text-white" />}
                                        gradient="bg-blue-900"
                                        trend="Blockchain"
                                    />
                                    <StatsCard
                                        title="Dernière Émission"
                                        value={stats.lastEmission ? stats.lastEmission.toLocaleDateString('fr-FR') : 'Aucune'}
                                        icon={<Clock className="h-6 w-6 text-white" />}
                                        gradient="bg-blue-900"
                                        trend={stats.lastEmission ? stats.lastEmission.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '-'}
                                    />
                                </div>

                                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                                    {/* Live Feed */}
                                    <Card className="lg:col-span-2 border-none shadow-lg bg-white/80 backdrop-blur-sm">
                                        <CardHeader>
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <CardTitle>Historique Récent</CardTitle>
                                                    <CardDescription>Flux des attestations émises en temps réel.</CardDescription>
                                                </div>
                                                <div className="flex items-center gap-2 text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">
                                                    <span className="relative flex h-2 w-2">
                                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75"></span>
                                                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                                                    </span>
                                                    Live
                                                </div>
                                            </div>
                                        </CardHeader>
                                        <CardContent>
                                            <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
                                                {events.length === 0 ? (
                                                    <div className="text-center py-10 text-muted-foreground">
                                                        <Network className="h-10 w-10 mx-auto mb-3 opacity-20" />
                                                        <p>Aucune attestation émise pour le moment.</p>
                                                    </div>
                                                ) : (
                                                    events.map((event, index) => (
                                                        <div key={index} className="flex items-center justify-between p-4 bg-secondary/20 hover:bg-secondary/40 rounded-xl border border-border/50 transition-colors group">
                                                            <div className="flex items-center gap-4">
                                                                <div className="h-10 w-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center">
                                                                    <FileCheck className="h-5 w-5" />
                                                                </div>
                                                                <div>
                                                                    <p className="text-sm font-bold text-foreground">{event.beneficiaire}</p>
                                                                    <p className="text-xs text-muted-foreground">{event.motif}</p>
                                                                </div>
                                                            </div>
                                                            <div className="text-right">
                                                                <span className="text-xs font-mono text-muted-foreground bg-secondary px-2 py-1 rounded-md">
                                                                    {event.timestamp.toLocaleTimeString()}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    ))
                                                )}
                                            </div>
                                        </CardContent>
                                    </Card>

                                    {/* Quick Actions / Status */}
                                    <div className="space-y-6">
                                        <Card className="border-none shadow-lg bg-gradient-to-b from-slate-900 to-slate-800 text-white">
                                            <CardHeader>
                                                <CardTitle className="text-white">État du Réseau</CardTitle>
                                                <CardDescription className="text-slate-400">Monitoring Web3</CardDescription>
                                            </CardHeader>
                                            <CardContent className="space-y-6">
                                                <div className="flex justify-between items-center">
                                                    <span className="text-sm text-slate-300">Statut</span>
                                                    <span className="flex items-center gap-2 text-sm font-bold text-emerald-400">
                                                        <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></div>
                                                        Opérationnel
                                                    </span>
                                                </div>
                                                <div className="space-y-2">
                                                    <span className="text-sm text-slate-300">Contrat</span>
                                                    <div className="flex items-center gap-2 bg-white/10 p-2 rounded-lg border border-white/5">
                                                        <FileText className="h-4 w-4 text-blue-400" />
                                                        <span className="text-xs font-mono text-slate-200 truncate">{CONTRACT_ADDRESS}</span>
                                                    </div>
                                                </div>
                                                <div className="pt-4">
                                                    <Button onClick={() => setActiveTab('issue')} className="w-full bg-blue-600 hover:bg-blue-500 text-white">
                                                        Nouvelle Émission
                                                    </Button>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    </div>
                                </div>
                            </motion.div>
                        )}


                        {activeTab === 'issue' && (
                            <motion.div
                                key="issue"
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                className="w-full"
                            >
                                {/* Layout Split-Screen Ajusté */}
                                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 h-full items-start">

                                    {/* Formulaire - Gauche (5 colonnes) */}
                                    <div className="lg:col-span-5 space-y-6 min-w-0">
                                        <Card className="border-none shadow-xl bg-white">
                                            <div className="h-2 bg-[#1e3a8a] w-full rounded-t-xl"></div>
                                            <CardHeader className="px-6 pt-6 pb-4 border-b border-slate-100">
                                                <div className="flex items-center gap-3 mb-1">
                                                    <div className="p-2.5 bg-blue-50 rounded-xl">
                                                        <Award className="h-6 w-6 text-[#1e3a8a]" />
                                                    </div>
                                                    <div>
                                                        <CardTitle className="text-xl font-bold text-[#1e3a8a]">
                                                            Émettre un Certificat
                                                        </CardTitle>
                                                        <CardDescription className="text-sm mt-0.5 text-slate-500">
                                                            Saisissez les détails du certificat
                                                        </CardDescription>
                                                    </div>
                                                </div>
                                            </CardHeader>

                                            <CardContent className="px-6 py-6">
                                                <form onSubmit={(e) => e.preventDefault()} className="space-y-5">
                                                    <div className="grid grid-cols-2 gap-4">
                                                        {/* Prénom */}
                                                        <div className="space-y-2">
                                                            <Label htmlFor="firstName" className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                                                                Prénom
                                                            </Label>
                                                            <Input
                                                                id="firstName"
                                                                placeholder="Ex: Jean"
                                                                value={formData.firstName}
                                                                onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                                                                className="h-11 text-sm border-slate-300 focus:border-[#1e3a8a] focus:ring-[#1e3a8a] rounded-lg"
                                                                required
                                                            />
                                                        </div>
                                                        {/* Nom */}
                                                        <div className="space-y-2">
                                                            <Label htmlFor="lastName" className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                                                                Nom
                                                            </Label>
                                                            <Input
                                                                id="lastName"
                                                                placeholder="Ex: Dupont"
                                                                value={formData.lastName}
                                                                onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                                                                className="h-11 text-sm border-slate-300 focus:border-[#1e3a8a] focus:ring-[#1e3a8a] rounded-lg"
                                                                required
                                                            />
                                                        </div>
                                                    </div>

                                                    {/* Email */}
                                                    <div className="space-y-2">
                                                        <Label htmlFor="email" className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                                                            Email (Notification)
                                                        </Label>
                                                        <div className="relative">
                                                            <Mail className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                                                            <Input
                                                                id="email"
                                                                type="email"
                                                                placeholder="email@exemple.com"
                                                                className="pl-10 h-11 text-sm border-slate-300 focus:border-[#1e3a8a] focus:ring-[#1e3a8a] rounded-lg"
                                                                value={formData.email}
                                                                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                                            />
                                                        </div>
                                                    </div>

                                                    {/* Titre du Certificat */}
                                                    <div className="space-y-2">
                                                        <Label htmlFor="description" className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                                                            Titre du Certificat
                                                        </Label>
                                                        <Input
                                                            id="description"
                                                            placeholder="Ex: Formation Blockchain"
                                                            value={formData.description}
                                                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                                            className="h-11 text-sm border-slate-300 focus:border-[#1e3a8a] focus:ring-[#1e3a8a] rounded-lg"
                                                            required
                                                        />
                                                    </div>


                                                    {/* Date & Organisme (Grid) */}
                                                    <div className="grid grid-cols-2 gap-4">
                                                        <div className="space-y-2">
                                                            <Label htmlFor="date" className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                                                                Date
                                                            </Label>
                                                            <Input
                                                                id="date"
                                                                type="date"
                                                                value={formData.date}
                                                                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                                                                className="h-11 text-sm border-slate-300 focus:border-[#1e3a8a] focus:ring-[#1e3a8a] rounded-lg"
                                                                required
                                                            />
                                                        </div>
                                                        <div className="space-y-2">
                                                            <Label htmlFor="organisme" className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                                                                Organisme
                                                            </Label>
                                                            <Input
                                                                id="organisme"
                                                                placeholder="Ex: Ministère"
                                                                value={formData.organisme}
                                                                onChange={(e) => setFormData({ ...formData, organisme: e.target.value })}
                                                                className="h-11 text-sm border-slate-300 focus:border-[#1e3a8a] focus:ring-[#1e3a8a] rounded-lg"
                                                                required
                                                            />
                                                        </div>
                                                    </div>



                                                    {/* Bouton Enregistrer le Certificat */}
                                                    <div className="pt-4">
                                                        <Button
                                                            type="button"
                                                            onClick={() => proceedWithCertificateCreation(formData)}
                                                            className={`w-full h-12 text-base font-bold bg-gradient-to-r from-[#1e3a8a] to-blue-700 hover:from-[#152b68] hover:to-[#1e3a8a] text-white shadow-lg rounded-lg transition-all ${!account ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                            disabled={status?.type === 'loading' || !account}
                                                        >
                                                            {status?.type === 'loading' ? (
                                                                <div className="flex items-center gap-2">
                                                                    <RefreshCw className="h-4 w-4 animate-spin" />
                                                                    <span>Enregistrement en cours...</span>
                                                                </div>
                                                            ) : (
                                                                <div className="flex items-center gap-2">
                                                                    <Shield className="h-4 w-4" />
                                                                    <span>Enregistrer sur la Blockchain</span>
                                                                </div>
                                                            )}
                                                        </Button>
                                                    </div>

                                                    {/* Message de statut */}
                                                    {status && (
                                                        <motion.div
                                                            initial={{ opacity: 0, y: 5 }}
                                                            animate={{ opacity: 1, y: 0 }}
                                                            className={`mt-4 p-3 rounded-lg flex items-center gap-3 ${status.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                                                                status.type === 'error' ? 'bg-red-50 text-red-700 border border-red-200' :
                                                                    'bg-blue-50 text-blue-700 border border-blue-200'
                                                                }`}
                                                        >
                                                            {status.type === 'success' ? <CheckCircle className="h-4 w-4 flex-shrink-0" /> :
                                                                status.type === 'error' ? <AlertTriangle className="h-4 w-4 flex-shrink-0" /> :
                                                                    <RefreshCw className="h-4 w-4 animate-spin flex-shrink-0" />}
                                                            <p className="font-medium text-xs">{status.message}</p>
                                                        </motion.div>
                                                    )}
                                                </form>
                                            </CardContent>
                                        </Card>
                                    </div>

                                    {/* Preview - Droite (7 colonnes) */}
                                    <div className="lg:col-span-7 lg:sticky lg:top-24 h-fit min-w-0">
                                        <div className="bg-slate-50/50 rounded-2xl border border-slate-200/60 p-6 flex flex-col items-center justify-center">
                                            <div className="mb-4 text-center">
                                                <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest flex items-center justify-center gap-2">
                                                    <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                                                    Aperçu en direct
                                                </h3>
                                            </div>

                                            {/* Conteneur Preview avec taille contrainte et effet d'ombre réaliste */}
                                            <div className="w-full shadow-2xl shadow-slate-200/50 rounded-[2rem] overflow-hidden transform transition-all hover:scale-[1.01] duration-500">
                                                <CertificatePreview
                                                    beneficiaire={`${formData.firstName} ${formData.lastName}`}
                                                    motif={formData.description}
                                                    date={formData.date}
                                                    organisme={formData.organisme}
                                                    ipfsHash={formData.ipfsHash}
                                                />
                                            </div>

                                            <p className="text-xs text-slate-400 mt-6 text-center max-w-sm">
                                                Ce document est un aperçu fidèle du certificat qui sera généré et inscrit sur la blockchain.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        )}



                        {activeTab === 'admins' && (
                            <motion.div
                                key="admins"
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                className="space-y-8 w-full"
                            >
                                <Card className="border-none shadow-xl bg-white/90 backdrop-blur-sm">
                                    <div className="h-2 bg-[#1e3a8a] w-full rounded-t-xl"></div>
                                    <CardHeader className="px-8 pt-8">
                                        <div className="flex items-center justify-between mb-2">
                                            <div className="flex items-center gap-4">
                                                <div className="h-14 w-14 rounded-xl bg-blue-50 flex items-center justify-center overflow-hidden border border-blue-100">
                                                    {newAdmin.photo ? (
                                                        <img src={newAdmin.photo} alt="Admin" className="h-full w-full object-cover" />
                                                    ) : (
                                                        <Users className="h-8 w-8 text-[#1e3a8a]" />
                                                    )}
                                                </div>
                                                <div>
                                                    <CardTitle className="text-2xl">
                                                        {editingAdmin ? 'Modifier l\'administrateur' : 'Gestion des Administrateurs'}
                                                    </CardTitle>
                                                    <CardDescription>
                                                        {editingAdmin ? 'Modifiez les informations de l\'administrateur.' : 'Ajoutez ou supprimez des accès administrateur.'}
                                                    </CardDescription>
                                                </div>
                                            </div>
                                            <div className="flex gap-2">
                                                {!editingAdmin && (
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        className="text-red-500 hover:text-red-700 hover:bg-red-50"
                                                        onClick={handleResetAdmins}
                                                    >
                                                        <RefreshCw className="mr-2 h-4 w-4" /> Réinitialiser
                                                    </Button>
                                                )}
                                                {editingAdmin && (
                                                    <Button type="button" variant="outline" onClick={handleCancelEdit}>
                                                        Annuler
                                                    </Button>
                                                )}
                                            </div>
                                        </div>
                                    </CardHeader>
                                    <CardContent className="px-8 pb-8">
                                        <form onSubmit={handleAddAdmin} className="space-y-6">
                                            {/* Photo Section */}
                                            <div className="flex flex-col md:flex-row items-center justify-center space-y-4 md:space-y-0 md:space-x-6 mb-8 p-6 bg-slate-50/50 rounded-2xl border border-slate-100">
                                                <div className="relative group">
                                                    <div className="h-32 w-32 rounded-full bg-white border-4 border-white shadow-xl flex items-center justify-center overflow-hidden transition-transform duration-300 group-hover:scale-105">
                                                        {newAdmin.photo ? (
                                                            <img src={newAdmin.photo} alt="Preview" className="h-full w-full object-cover" />
                                                        ) : (
                                                            <Users className="h-12 w-12 text-slate-300" />
                                                        )}
                                                    </div>
                                                    {newAdmin.photo && (
                                                        <button
                                                            type="button"
                                                            onClick={() => setNewAdmin({ ...newAdmin, photo: '' })}
                                                            className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1.5 hover:bg-red-600 transition-colors shadow-sm"
                                                        >
                                                            <X className="h-4 w-4" />
                                                        </button>
                                                    )}
                                                </div>
                                                <div className="flex flex-col gap-3 w-full md:w-auto">
                                                    <div className="relative w-full">
                                                        <input
                                                            type="file"
                                                            accept="image/*"
                                                            onChange={handleFileUpload}
                                                            className="hidden"
                                                            id="photo-upload"
                                                        />
                                                        <Label
                                                            htmlFor="photo-upload"
                                                            className="flex items-center justify-center gap-2 px-6 py-3 bg-white border border-slate-200 rounded-xl cursor-pointer hover:bg-blue-50 hover:border-blue-200 hover:text-blue-700 transition-all text-sm font-semibold text-slate-700 shadow-sm w-full md:w-48"
                                                        >
                                                            <Upload className="h-4 w-4" />
                                                            Importer Photo
                                                        </Label>
                                                    </div>
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        onClick={() => startWebcam('photo')}
                                                        className="flex items-center justify-center gap-2 px-6 py-6 rounded-xl border-slate-200 hover:bg-blue-50 hover:border-blue-200 hover:text-blue-700 font-semibold shadow-sm w-full md:w-48 z-10 relative"
                                                    >
                                                        <Camera className="h-4 w-4" />
                                                        Prendre Photo
                                                    </Button>
                                                </div>

                                                {/* Button Isolated for Debugging */}
                                                <div className="w-full md:w-auto z-20 relative">
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        onClick={(e) => {
                                                            e.preventDefault();
                                                            e.stopPropagation();
                                                            console.log("Button clicked!");
                                                            startWebcam('faceId');
                                                        }}
                                                        className={`flex items-center justify-center gap-2 px-6 py-6 rounded-xl border-slate-200 font-semibold shadow-sm w-full md:w-48 transition-all ${newAdmin.faceIdConfigured
                                                            ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100'
                                                            : 'bg-blue-600 text-white hover:bg-blue-700 border-blue-600'
                                                            }`}
                                                    >
                                                        <ScanFace className="h-4 w-4" />
                                                        {newAdmin.faceIdConfigured ? 'Face ID Configuré' : 'Configurer Face ID'}
                                                    </Button>
                                                </div>
                                            </div>



                                            {/* Status Face ID */}
                                            {newAdmin.faceIdConfigured && (
                                                <div className="flex items-center justify-center gap-2 p-3 bg-green-50 text-green-700 rounded-xl border border-green-200 mb-6">
                                                    <CheckCircle className="h-5 w-5" />
                                                    <span className="font-medium">Face ID prêt pour cet administrateur</span>
                                                </div>
                                            )}

                                            <div className="grid md:grid-cols-2 gap-6">
                                                <div className="space-y-2">
                                                    <Label>Prénom</Label>
                                                    <Input
                                                        placeholder="Ex: Michel"
                                                        value={newAdmin.firstName}
                                                        onChange={(e) => setNewAdmin({ ...newAdmin, firstName: e.target.value })}
                                                        required
                                                    />
                                                </div>
                                                <div className="space-y-2">
                                                    <Label>Nom</Label>
                                                    <Input
                                                        placeholder="Ex: Dupont"
                                                        value={newAdmin.lastName}
                                                        onChange={(e) => setNewAdmin({ ...newAdmin, lastName: e.target.value })}
                                                        required
                                                    />
                                                </div>
                                                <div className="space-y-2">
                                                    <Label>Nom d'utilisateur</Label>
                                                    <Input
                                                        placeholder="Ex: michel.dupont"
                                                        value={newAdmin.username}
                                                        onChange={(e) => setNewAdmin({ ...newAdmin, username: e.target.value })}
                                                        required
                                                    />
                                                </div>
                                                <div className="space-y-2">
                                                    <Label>Mot de passe</Label>
                                                    <div className="relative">
                                                        <Input
                                                            type={showPassword ? "text" : "password"}
                                                            placeholder="••••••••"
                                                            value={newAdmin.password}
                                                            onChange={(e) => setNewAdmin({ ...newAdmin, password: e.target.value })}
                                                            required
                                                            className="pr-10"
                                                        />
                                                        <button
                                                            type="button"
                                                            onClick={() => setShowPassword(!showPassword)}
                                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                                                        >
                                                            {showPassword ? (
                                                                <EyeOff className="h-4 w-4" />
                                                            ) : (
                                                                <Eye className="h-4 w-4" />
                                                            )}
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                            <Button type="submit" className="w-full bg-[#1e3a8a] hover:bg-blue-900 text-white">
                                                {editingAdmin ? 'Modifier l\'administrateur' : 'Ajouter Administrateur'}
                                            </Button>


                                        </form>
                                    </CardContent>
                                </Card>

                                <AdminTable data={admins} onRemoveAdmin={handleRemoveAdmin} onEditAdmin={handleEditAdmin} />
                            </motion.div>
                        )}
                    </AnimatePresence>
                </main>
            </motion.div>

            {/* Modal Webcam / Face ID Style iPhone */}
            {showWebcam && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-xl p-4">
                    {webcamMode === 'faceId' ? (
                        /* === MODAL FACE ID STYLE IPHONE === */
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="relative w-full max-w-md mx-auto flex flex-col items-center"
                        >
                            {/* Header */}
                            <div className="mb-8 text-center space-y-3">
                                <motion.div
                                    initial={{ y: -20, opacity: 0 }}
                                    animate={{ y: 0, opacity: 1 }}
                                    className={`inline-flex items-center justify-center p-4 rounded-full mb-4 backdrop-blur-md ${faceIdScanPhase === 'success' ? 'bg-green-500/20' :
                                        faceIdScanPhase === 'error' ? 'bg-red-500/20' :
                                            'bg-white/10'
                                        }`}
                                >
                                    <ScanFace className={`w-10 h-10 ${faceIdScanPhase === 'success' ? 'text-green-400' :
                                        faceIdScanPhase === 'error' ? 'text-red-400' :
                                            'text-white'
                                        }`} />
                                </motion.div>
                                <h2 className="text-2xl font-bold text-white tracking-tight">
                                    {faceIdScanPhase === 'success' ? 'Face ID Enregistré !' :
                                        faceIdScanPhase === 'error' ? 'Échec du Scan' :
                                            'Configuration Face ID'}
                                </h2>
                                <p className="text-sm text-white/70">
                                    {scanMessage || 'Préparation de la caméra...'}
                                </p>
                            </div>

                            {/* Scanner Container - Style iPhone */}
                            <div className="relative w-72 h-72">
                                {/* Outer Ring Animation */}
                                <motion.div
                                    animate={{
                                        rotate: faceIdScanPhase === 'scanning' ? 360 : 0,
                                        borderColor: faceIdScanPhase === 'success' ? '#22c55e' :
                                            faceIdScanPhase === 'error' ? '#ef4444' :
                                                '#3b82f6'
                                    }}
                                    transition={{
                                        rotate: { duration: 2, repeat: Infinity, ease: 'linear' },
                                        borderColor: { duration: 0.3 }
                                    }}
                                    className="absolute -inset-3 rounded-full border-4 border-dashed opacity-50"
                                    style={{ borderColor: faceIdScanPhase === 'success' ? '#22c55e' : faceIdScanPhase === 'error' ? '#ef4444' : '#3b82f6' }}
                                />

                                {/* Blue Filling Progress Circle */}
                                <svg className="absolute -inset-2 w-[calc(100%+1rem)] h-[calc(100%+1rem)] rotate-[-90deg] z-10 pointer-events-none">
                                    <circle
                                        cx="50%"
                                        cy="50%"
                                        r="48%"
                                        fill="none"
                                        stroke="#3b82f6"
                                        strokeWidth="6"
                                        strokeDasharray="100 100"
                                        strokeDashoffset={100 - scanProgress}
                                        pathLength="100"
                                        strokeLinecap="round"
                                        className="transition-all duration-300 ease-out opacity-80"
                                    />
                                </svg>

                                {/* Video Container */}
                                <div className="absolute inset-0 rounded-full overflow-hidden bg-black border-4 border-white/20 shadow-2xl">
                                    <video
                                        ref={videoRef}
                                        autoPlay
                                        playsInline
                                        muted
                                        className={`w-full h-full object-cover transform scale-125 transition-all duration-500 ${faceIdScanPhase === 'success' ? 'blur-sm opacity-60' : ''
                                            }`}
                                        style={{ transform: 'scaleX(-1) scale(1.3)' }}
                                    />

                                    {/* Face Mesh Overlay Canvas */}
                                    <canvas
                                        ref={meshCanvasRef}
                                        className="absolute inset-0 w-full h-full pointer-events-none"
                                        style={{ transform: 'scaleX(-1) scale(1.3)', transformOrigin: 'center center' }}
                                    />

                                    {/* Head Turn Challenge Indicator */}
                                    {headChallenge && headChallenge !== 'final' && faceIdScanPhase === 'scanning' && (
                                        <motion.div
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            className="absolute inset-0 flex items-center justify-center pointer-events-none"
                                        >
                                            {headChallenge === 'left' && (
                                                <motion.div
                                                    animate={{ x: [-10, -20, -10] }}
                                                    transition={{ duration: 1, repeat: Infinity }}
                                                    className="absolute left-2 text-4xl"
                                                >
                                                    ⬅️
                                                </motion.div>
                                            )}
                                            {headChallenge === 'right' && (
                                                <motion.div
                                                    animate={{ x: [10, 20, 10] }}
                                                    transition={{ duration: 1, repeat: Infinity }}
                                                    className="absolute right-2 text-4xl"
                                                >
                                                    ➡️
                                                </motion.div>
                                            )}
                                        </motion.div>
                                    )}

                                    {/* Scan Overlay Animation */}
                                    {faceIdScanPhase === 'scanning' && (
                                        <motion.div
                                            animate={{
                                                top: ['-50%', '150%'],
                                            }}
                                            transition={{
                                                duration: 2,
                                                repeat: Infinity,
                                                ease: 'easeInOut'
                                            }}
                                            className="absolute left-0 right-0 h-1/3 bg-gradient-to-b from-transparent via-blue-500/30 to-transparent"
                                        />

                                    )}

                                    {/* Success Overlay */}
                                    {faceIdScanPhase === 'success' && (
                                        <motion.div
                                            initial={{ opacity: 0, scale: 0.5 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            className="absolute inset-0 flex items-center justify-center bg-green-500/30"
                                        >
                                            <motion.div
                                                initial={{ scale: 0 }}
                                                animate={{ scale: 1 }}
                                                transition={{ type: 'spring', delay: 0.2 }}
                                                className="bg-green-500 rounded-full p-6 shadow-xl"
                                            >
                                                <CheckCircle className="w-16 h-16 text-white" />
                                            </motion.div>
                                        </motion.div>
                                    )}

                                    {/* Error Overlay */}
                                    {faceIdScanPhase === 'error' && (
                                        <motion.div
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            className="absolute inset-0 flex items-center justify-center bg-red-500/30"
                                        >
                                            <div className="bg-red-500 rounded-full p-6 shadow-xl">
                                                <X className="w-16 h-16 text-white" />
                                            </div>
                                        </motion.div>
                                    )}
                                </div>

                                {/* Progress Ring */}
                                <svg className="absolute -inset-1 w-[calc(100%+8px)] h-[calc(100%+8px)]" style={{ transform: 'rotate(-90deg)' }}>
                                    <circle
                                        cx="50%"
                                        cy="50%"
                                        r="48%"
                                        fill="none"
                                        stroke="rgba(255,255,255,0.1)"
                                        strokeWidth="4"
                                    />
                                    <motion.circle
                                        cx="50%"
                                        cy="50%"
                                        r="48%"
                                        fill="none"
                                        stroke={faceIdScanPhase === 'success' ? '#22c55e' : faceIdScanPhase === 'error' ? '#ef4444' : '#3b82f6'}
                                        strokeWidth="4"
                                        strokeLinecap="round"
                                        initial={{ pathLength: 0 }}
                                        animate={{ pathLength: scanProgress / 100 }}
                                        transition={{ duration: 0.3 }}
                                        style={{
                                            strokeDasharray: '100%',
                                            strokeDashoffset: `${100 - scanProgress}%`
                                        }}
                                    />
                                </svg>
                            </div>

                            {/* Progress Text */}
                            <div className="mt-6 text-center">
                                <span className="text-3xl font-bold text-white">{Math.round(scanProgress)}%</span>
                            </div>

                            {/* Actions */}
                            <div className="mt-8 flex gap-4">
                                {faceIdScanPhase === 'error' && (
                                    <Button
                                        onClick={() => startFaceIdScan()}
                                        className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-full"
                                    >
                                        Réessayer
                                    </Button>
                                )}
                                <Button
                                    variant="ghost"
                                    className="text-white/60 hover:text-white hover:bg-white/10 rounded-full px-8"
                                    onClick={stopWebcam}
                                >
                                    Annuler
                                </Button>
                            </div>

                            <canvas ref={canvasRef} className="hidden" width={640} height={480} />
                        </motion.div>
                    ) : (
                        /* === MODAL PHOTO SIMPLE === */
                        <div className="bg-white rounded-2xl p-4 max-w-lg w-full space-y-4 shadow-2xl">
                            <div className="flex justify-between items-center">
                                <h3 className="font-bold text-lg">Prendre une photo de profil</h3>
                                <Button type="button" variant="ghost" size="icon" onClick={stopWebcam}>
                                    <X className="h-5 w-5" />
                                </Button>
                            </div>
                            <div className="relative aspect-video bg-black rounded-xl overflow-hidden">
                                <video
                                    ref={videoRef}
                                    autoPlay
                                    playsInline
                                    muted
                                    className="w-full h-full object-cover transform scale-x-[-1]"
                                />
                            </div>
                            <div className="flex justify-center">
                                <Button type="button" onClick={capturePhoto} className="bg-[#1e3a8a] text-white gap-2 px-8 py-6 text-lg rounded-xl">
                                    <Camera className="h-5 w-5" />
                                    Capturer
                                </Button>
                            </div>
                            <canvas ref={canvasRef} className="hidden" width={640} height={480} />
                        </div>
                    )}
                </div>
            )}
        </div >
    );
};

export default AdminPage;
