import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Shield, ArrowRight, Lock, ScanFace } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { StarsBackground } from './ui/stars-background';
import { ShootingStars } from './ui/shooting-stars';
import FaceLogin from './FaceLogin';

// Admin accounts
// Admin accounts (Fallback defaults)
const DEFAULT_ADMINS = [
    { id: '1', username: 'Michel', password: 'Michel7', firstName: 'Michel', lastName: 'Maleka', photo: '/images/michel.png', status: 'Active' },
    { id: '2', username: 'Gilva', password: 'Gilva7', firstName: 'Gilva', lastName: 'Kabongo', photo: '/images/gilva.jpg', status: 'Active' },
    { id: '3', username: 'Fiston', password: 'Fiston7', firstName: 'Fiston', lastName: 'Kalonda', photo: '/images/fiston.jpg', status: 'Active' }
];

const LoginPage = () => {
    const navigate = useNavigate();
    const [isLoading, setIsLoading] = useState(false);
    const [credentials, setCredentials] = useState({ username: '', password: '' });
    const [error, setError] = useState('');
    const [showFaceLogin, setShowFaceLogin] = useState(false);

    // Load admins from localStorage to ensure we have the latest data (including changes made in AdminPage)
    // If no data exists, we use the defaults.
    const [admins] = useState(() => {
        const savedAdmins = localStorage.getItem('registeredAdmins');
        if (savedAdmins) {
            return JSON.parse(savedAdmins);
        }
        // If not in storage, use defaults and save them (to seed the app)
        localStorage.setItem('registeredAdmins', JSON.stringify(DEFAULT_ADMINS));
        return DEFAULT_ADMINS;
    });

    const handleFaceLoginSuccess = (account) => {
        setShowFaceLogin(false);
        setIsLoading(true);
        // Simulate a small connection delay
        setTimeout(() => {
            sessionStorage.setItem('isLoggedIn', 'true');
            sessionStorage.setItem('currentUser', JSON.stringify(account));
            navigate('/admin');
        }, 800);
    };

    const handleLogin = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');

        // Validate credentials against the LOADED admins (from localStorage)
        setTimeout(() => {
            const validAccount = admins.find(
                acc => acc.username === credentials.username && acc.password === credentials.password
            );

            if (validAccount) {
                // Store login state and user info
                sessionStorage.setItem('isLoggedIn', 'true');
                sessionStorage.setItem('currentUser', JSON.stringify(validAccount));
                navigate('/admin');
            } else {
                setError('Nom d\'utilisateur ou mot de passe incorrect.');
                setIsLoading(false);
            }
        }, 1000);
    };

    return (
        <div className="min-h-screen w-full bg-slate-950 flex items-center justify-center relative overflow-hidden">
            {/* Background Effects */}
            <div className="absolute inset-0 z-0">
                <StarsBackground />
                <ShootingStars />
            </div>

            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-slate-950/50 to-slate-950 z-0 pointer-events-none" />

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="relative z-10 w-full max-w-md px-4 md:px-0"
            >
                <Card className="border-slate-800 bg-slate-900/50 backdrop-blur-xl shadow-2xl overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-600 via-indigo-500 to-blue-600" />

                    <CardHeader className="text-center pt-10 pb-2">
                        <motion.div
                            initial={{ scale: 0.5, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ delay: 0.2, type: "spring" }}
                            className="mx-auto bg-blue-950/50 p-4 rounded-2xl mb-6 inline-flex ring-1 ring-blue-800/50 shadow-lg shadow-blue-900/20"
                        >
                            <img src="/logo%20certificat.png" alt="GouvChain Logo" className="h-10 w-auto" />
                        </motion.div>
                        <CardTitle className="text-3xl font-bold text-white tracking-tight">Portail Agent</CardTitle>
                        <CardDescription className="text-slate-400 text-base mt-2">
                            Connectez-vous pour accéder au tableau de bord d'administration GouvChain.
                        </CardDescription>
                    </CardHeader>

                    <CardContent className="p-8 pt-6">
                        <form onSubmit={handleLogin} className="space-y-6">
                            <div className="space-y-2">
                                <Label htmlFor="username" className="text-slate-300">Nom d'utilisateur</Label>
                                <Input
                                    id="username"
                                    type="text"
                                    placeholder="Entrez votre nom d'utilisateur"
                                    value={credentials.username}
                                    onChange={(e) => setCredentials({ ...credentials, username: e.target.value })}
                                    className="h-12 bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500"
                                    required
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="password" className="text-slate-300">Mot de passe</Label>
                                <Input
                                    id="password"
                                    type="password"
                                    placeholder="Entrez votre mot de passe"
                                    value={credentials.password}
                                    onChange={(e) => setCredentials({ ...credentials, password: e.target.value })}
                                    className="h-12 bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500"
                                    required
                                />
                            </div>

                            <Button
                                type="submit"
                                disabled={isLoading}
                                className="w-full h-14 text-lg font-medium bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white border-0 shadow-lg shadow-blue-900/20 transition-all duration-300 group"
                            >
                                {isLoading ? (
                                    <div className="flex items-center gap-2">
                                        <div className="h-5 w-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                        <span>Connexion...</span>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-3">
                                        <Lock className="h-5 w-5" />
                                        <span>Se connecter</span>
                                        <ArrowRight className="h-5 w-5 ml-1 group-hover:translate-x-1 transition-transform" />
                                    </div>
                                )}
                            </Button>

                            <div className="relative flex items-center justify-center my-4">
                                <span className="absolute px-2 bg-slate-900 text-xs text-slate-500">OU</span>
                                <div className="w-full border-t border-slate-800"></div>
                            </div>

                            <Button
                                type="button"
                                onClick={() => setShowFaceLogin(true)}
                                className="w-full h-12 bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 transition-colors flex items-center justify-center gap-2"
                            >
                                <ScanFace className="w-5 h-5 mr-2" />
                                Se connecter avec Face ID
                            </Button>

                            {error && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    className="text-red-400 text-sm text-center bg-red-950/30 py-2 rounded-lg border border-red-900/50"
                                >
                                    {error}
                                </motion.div>
                            )}

                            <div className="relative">
                                <div className="absolute inset-0 flex items-center">
                                    <span className="w-full border-t border-slate-800" />
                                </div>
                                <div className="relative flex justify-center text-xs uppercase">
                                    <span className="bg-slate-900 px-2 text-slate-500">Sécurisé par la Blockchain</span>
                                </div>
                            </div>
                        </form>
                    </CardContent>

                    <div className="bg-slate-950/50 p-4 text-center border-t border-slate-800">
                        <p className="text-xs text-slate-500">
                            Accès réservé au personnel autorisé du Ministère du Numérique.
                        </p>
                    </div>
                </Card>
            </motion.div>

            <FaceLogin
                isOpen={showFaceLogin}
                onClose={() => setShowFaceLogin(false)}
                onLogin={handleFaceLoginSuccess}
                adminAccounts={admins}
            />
        </div >
    );
};
export default LoginPage;
