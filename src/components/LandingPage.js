import React, { useState, useEffect } from 'react';
import Web3 from 'web3';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { FileText, CheckCircle, Search, AlertTriangle, ExternalLink, ShieldCheck, Zap, Globe, ChevronDown, GraduationCap, Users, User, Award, FileKey, Database, Network, Code2, Twitter, Github, Linkedin, Mail, MapPin, ArrowRight, Facebook, Calendar, Building2, Download } from 'lucide-react';
import { Particles } from "./ui/particles";
import { PointerHighlight } from "./ui/pointer-highlight";
import { AnimatedTooltip } from "./ui/animated-tooltip";
import {
    Navbar,
    NavBody,
    NavItems,
    MobileNav,
    NavbarLogo,
    MobileNavHeader,
    MobileNavToggle,
    MobileNavMenu,
} from "./ui/resizable-navbar";
import { CONTRACT_ADDRESS, CONTRACT_ABI } from '../config';

const companiesLogo = [
    { name: "Regideso", logo: "/logo defilant/regideso logo.png" },
    { name: "Numerique", logo: "/logo defilant/numerique log.png" },
    { name: "Unikin", logo: "/logo defilant/unikin.png" },
    { name: "RTNC", logo: "/logo defilant/rtnc logo.png" }
];

const profiles = [
    {
        id: 1,
        name: "Michel Maleka",
        designation: "Groupe 7",
        image: "/Michel Maleka M.png",
    },
    {
        id: 2,
        name: "Gilva Kabongo",
        designation: "Groupe 7",
        image: "/GILVA KABONGO.jpg",
    },
    {
        id: 3,
        name: "Fiston Kalonda",
        designation: "Groupe 7",
        image: "/FISTON KABONGO.jpg",
    },
];



const LandingPage = () => {
    const [verificationId, setVerificationId] = useState('');
    const [verificationResult, setVerificationResult] = useState(null);
    const [loading, setLoading] = useState(false);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    const navItems = [
        { name: "Accueil", link: "#accueil" },
        { name: "A propos", link: "#apropos" },
        { name: "Verification", link: "#verification" },
        { name: "Faq", link: "#faqs" },
    ];

    const verifyCertificate = async (idToVerify) => {
        setLoading(true);
        setVerificationResult(null);

        if (!idToVerify) {
            setLoading(false);
            return;
        }

        try {
            // Initialisation Web3 - avec fallback RPC pour lecture seule
            let web3;
            const RPC_URL = "https://virtual.mainnet.eu.rpc.tenderly.co/beea34ad-7bec-471c-a3f1-8f173044901b";

            if (window.ethereum) {
                web3 = new Web3(window.ethereum);
            } else {
                // Fallback : utiliser le RPC directement (lecture seule)
                console.log("MetaMask non détecté, utilisation du RPC en lecture seule");
                web3 = new Web3(new Web3.providers.HttpProvider(RPC_URL));
            }

            const contract = new web3.eth.Contract(CONTRACT_ABI, CONTRACT_ADDRESS);

            // Détecter si c'est un hash IPFS ou un ID unique
            const isIpfsHash = idToVerify.startsWith('Qm') || idToVerify.startsWith('bafy');

            let result;
            let certIdBytes32;

            if (isIpfsHash) {
                // Recherche par hash IPFS via les événements
                console.log("Recherche par hash IPFS:", idToVerify);

                try {
                    const events = await contract.getPastEvents('CertificatEnregistre', {
                        fromBlock: 0,
                        toBlock: 'latest'
                    });

                    console.log("Événements trouvés:", events.length);

                    // Chercher le certificat avec ce hash IPFS
                    let foundCert = null;
                    for (const event of events) {
                        const certId = event.returnValues.idUnique;
                        const eventHash = event.returnValues.hashDocument;

                        // Comparer directement le hash de l'événement
                        if (eventHash === idToVerify) {
                            // Vérifier si le certificat existe et récupérer les détails
                            const isRegistered = await contract.methods.estEnregistre(certId).call();
                            if (isRegistered) {
                                foundCert = await contract.methods.getCertificat(certId).call();
                                certIdBytes32 = certId;
                                console.log("Certificat trouvé!", foundCert);
                                break;
                            }
                        }
                    }

                    if (foundCert) {
                        result = foundCert;
                    } else {
                        result = { existe: false };
                    }
                } catch (error) {
                    console.error("Erreur recherche IPFS:", error);
                    result = { existe: false };
                }
            } else {
                // Conversion de l'ID en bytes32
                // Si l'ID commence par "ID-", on le convertit en bytes32
                if (idToVerify.startsWith('ID-')) {
                    // Convertir "ID-XXX" en bytes32 via hashing
                    certIdBytes32 = web3.utils.keccak256(idToVerify);
                } else if (idToVerify.startsWith('0x')) {
                    // Déjà en format bytes32
                    certIdBytes32 = idToVerify;
                } else {
                    // Essayer de le convertir
                    certIdBytes32 = web3.utils.keccak256(idToVerify);
                }

                console.log("ID converti en bytes32:", certIdBytes32);

                // Vérification par ID avec le nouveau contrat GouvChain
                const isRegistered = await contract.methods.estEnregistre(certIdBytes32).call();

                if (isRegistered) {
                    result = await contract.methods.getCertificat(certIdBytes32).call();
                } else {
                    result = { existe: false };
                }
            }

            console.log("Résultat de vérification:", result);

            if (result && result.existe) {
                // Nouveau contrat GouvChain : pas de révocation, juste valide ou non
                setVerificationResult({
                    status: "valid",
                    beneficiary: result.nomBeneficiaire,
                    event: result.titreCertificat,
                    date: result.dateCert,
                    issuer: result.organisme,
                    ipfsLink: `https://gateway.pinata.cloud/ipfs/${result.hashDocument}`,
                    issuedAt: result.issuedAt // Timestamp d'enregistrement
                });
            } else {
                setVerificationResult({
                    status: "not_found",
                    message: `Aucun certificat trouvé pour ${isIpfsHash ? 'ce hash IPFS' : 'cet identifiant'}.`
                });
            }

        } catch (error) {
            console.error("Erreur de vérification:", error);
            setVerificationResult({
                status: "not_found",
                message: "Erreur lors de la vérification. Vérifiez votre saisie et la connexion blockchain."
            });
        } finally {
            setLoading(false);
        }
    };

    const handleVerify = async (e) => {
        e.preventDefault();
        await verifyCertificate(verificationId);
    };

    // Auto-verification via URL param
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const verifyParam = params.get('verify');
        if (verifyParam) {
            setVerificationId(verifyParam);
            verifyCertificate(verifyParam);
            // Scroll to verification section
            setTimeout(() => {
                document.getElementById('verification')?.scrollIntoView({ behavior: 'smooth' });
            }, 500);
        }
    }, []);

    return (
        <div className="min-h-screen bg-background text-foreground overflow-x-hidden font-sans selection:bg-primary/10 w-full max-w-[100vw]">
            {/* Navbar */}
            <Navbar>
                {/* Desktop Navigation */}
                <NavBody>
                    <NavbarLogo>
                        <div className="flex items-center gap-3">
                            <img src="/header-logo.png" alt="GouvChain Logo" className="h-14 w-auto object-contain" />
                        </div>
                    </NavbarLogo>
                    <NavItems items={navItems} />
                </NavBody>

                {/* Mobile Navigation */}
                <MobileNav>
                    <MobileNavHeader>
                        <NavbarLogo>
                            <div className="flex items-center gap-2.5">
                                <img src="/header-logo.png" alt="GouvChain Logo" className="h-12 w-auto object-contain" />
                            </div>
                        </NavbarLogo>
                        <MobileNavToggle
                            isOpen={isMobileMenuOpen}
                            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                        />
                    </MobileNavHeader>

                    <MobileNavMenu
                        isOpen={isMobileMenuOpen}
                        onClose={() => setIsMobileMenuOpen(false)}
                    >
                        {navItems.map((item, idx) => (
                            <a
                                key={`mobile-link-${idx}`}
                                href={item.link}
                                onClick={() => setIsMobileMenuOpen(false)}
                                className="relative text-neutral-600 dark:text-neutral-300 py-2"
                            >
                                <span className="block text-lg font-medium">{item.name}</span>
                            </a>
                        ))}
                    </MobileNavMenu>
                </MobileNav>
            </Navbar>

            {/* Hero Section */}
            <section id="accueil" className="relative pt-32 pb-32 overflow-hidden flex flex-col items-center justify-center text-center min-h-screen bg-[radial-gradient(ellipse_at_bottom,_#f5f5f5_0%,_#fff_100%)]">
                <Particles
                    className="absolute inset-0 z-0"
                    quantity={200}
                    ease={80}
                    color="#152b68"
                    size={2.5}
                    staticity={30}
                    refresh
                />
                <div className="container mx-auto px-6 relative z-10 flex flex-col items-center max-w-5xl">

                    <motion.h1
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, delay: 0.1 }}
                        className="text-4xl md:text-6xl lg:text-8xl font-bold tracking-tighter mb-6 text-[#152b68]"
                    >
                        Authentification <br />
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#152b68] to-blue-500 inline-flex items-center gap-2 justify-center">
                            Officielle &
                            <PointerHighlight className="inline-block">
                                <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#152b68] to-blue-500">Sécurisée</span>
                            </PointerHighlight>
                        </span>
                    </motion.h1>

                    <motion.p
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, delay: 0.2 }}
                        className="text-xl md:text-2xl text-slate-500 mb-10 max-w-3xl leading-relaxed font-medium"
                    >
                        La plateforme de référence pour l'émission et la vérification de documents gouvernementaux sur la blockchain.
                    </motion.p>

                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, delay: 0.3 }}
                        className="flex flex-col sm:flex-row gap-6 justify-center mb-16"
                    >
                        <motion.div
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            animate={{
                                boxShadow: [
                                    "0 0 0 0 rgba(21, 43, 104, 0)",
                                    "0 0 0 8px rgba(21, 43, 104, 0.1)",
                                    "0 0 0 0 rgba(21, 43, 104, 0)"
                                ]
                            }}
                            transition={{
                                boxShadow: {
                                    duration: 2,
                                    repeat: Infinity,
                                    ease: "easeInOut"
                                }
                            }}
                            className="rounded-xl"
                        >
                            <Button
                                size="lg"
                                className="h-16 px-10 text-xl font-bold bg-[#152b68] hover:bg-[#152b68]/90 text-white rounded-xl shadow-lg hover:shadow-xl transition-all"
                                onClick={() => {
                                    setTimeout(() => {
                                        const verificationSection = document.getElementById('verification');
                                        if (verificationSection) {
                                            const yOffset = -80; // Offset for navbar
                                            const y = verificationSection.getBoundingClientRect().top + window.pageYOffset + yOffset;
                                            window.scrollTo({ top: y, behavior: 'smooth' });
                                        }
                                    }, 100);
                                }}
                            >
                                Vérification
                            </Button>
                        </motion.div>
                        <motion.div
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                        >
                            <Button
                                size="lg"
                                variant="outline"
                                className="h-16 px-10 text-xl font-bold border-2 border-[#152b68] text-[#152b68] hover:bg-[#152b68]/5 rounded-xl"
                                onClick={() => {
                                    setTimeout(() => {
                                        const aboutSection = document.getElementById('apropos');
                                        if (aboutSection) {
                                            const yOffset = -80; // Offset for navbar
                                            const y = aboutSection.getBoundingClientRect().top + window.pageYOffset + yOffset;
                                            window.scrollTo({ top: y, behavior: 'smooth' });
                                        }
                                    }, 100);
                                }}
                            >
                                À propos
                            </Button>
                        </motion.div>
                    </motion.div>

                    {/* Team Profiles */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, delay: 0.4 }}
                        className="flex items-center justify-center gap-4 mt-4"
                    >
                        <h3 className="text-lg font-bold text-[#152b68]">Réalisé par le Groupe 7</h3>
                        <AnimatedTooltip items={profiles} />
                    </motion.div>

                    {/* Verification Card (Moved down or kept as secondary element if needed, but user asked for minimalist hero style. 
                        I will keep it below the hero content for functionality, but maybe add some spacing) */}
                </div>
            </section>

            {/* Logo Cloud Section */}
            <section className="py-20 bg-[#152B68] overflow-hidden">
                <style>{`
                    @keyframes marquee {
                        0% { transform: translateX(0%); }
                        100% { transform: translateX(-50%); }
                    }
                    .logo-track {
                        display: flex;
                        width: fit-content;
                        animation: marquee 20s linear infinite;
                    }
                    .logo-track:hover {
                        animation-play-state: paused;
                    }
                `}</style>
                <div className="container mx-auto px-6">
                    <div className="relative mx-auto max-w-6xl">
                        <h2 className="mb-10 text-center font-medium text-xl tracking-tight md:text-3xl">
                            <span className="text-white">Approuvé par les institutions.</span>
                            <br />
                            <span className="font-semibold text-white">Utilisé par les leaders.</span>
                        </h2>
                        <div className="mx-auto my-5 h-px max-w-sm bg-white/30 [mask-image:linear-gradient(to_right,transparent,white,transparent)]" />

                        <div className="relative w-full overflow-hidden">
                            {/* Gradients latéraux pour l'effet de fondu */}
                            <div className="absolute left-0 top-0 h-full w-20 z-10 pointer-events-none bg-gradient-to-r from-[#152B68] to-transparent" />
                            <div className="absolute right-0 top-0 h-full w-20 z-10 pointer-events-none bg-gradient-to-l from-[#152B68] to-transparent" />

                            <div className="logo-track">
                                {/* Première moitié */}
                                {[...Array(4)].map((_, repeatIndex) => (
                                    <div key={`first-${repeatIndex}`} className="flex items-center shrink-0">
                                        {companiesLogo.map((company, index) => (
                                            <img
                                                key={`logo-1-${repeatIndex}-${index}`}
                                                className={`mx-10 md:mx-16 h-16 md:h-20 w-auto object-contain opacity-80 hover:opacity-100 transition-opacity duration-300
                                                    ${company.name === 'Unikin' ? 'translate-y-1' : ''}
                                                    ${company.name === 'Numerique' ? 'scale-150' : ''}
                                                `}
                                                src={company.logo}
                                                alt={company.name}
                                            />
                                        ))}
                                    </div>
                                ))}
                                {/* Deuxième moitié (copie exacte pour boucle infinie) */}
                                {[...Array(4)].map((_, repeatIndex) => (
                                    <div key={`second-${repeatIndex}`} className="flex items-center shrink-0">
                                        {companiesLogo.map((company, index) => (
                                            <img
                                                key={`logo-2-${repeatIndex}-${index}`}
                                                className={`mx-10 md:mx-16 h-16 md:h-20 w-auto object-contain opacity-80 hover:opacity-100 transition-opacity duration-300
                                                    ${company.name === 'Unikin' ? 'translate-y-1' : ''}
                                                    ${company.name === 'Numerique' ? 'scale-150' : ''}
                                                `}
                                                src={company.logo}
                                                alt={company.name}
                                            />
                                        ))}
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="mt-5 h-px bg-white/30 [mask-image:linear-gradient(to_right,transparent,white,transparent)]" />
                    </div>
                </div>
            </section>

            {/* A Propos Section - Clean Modern Grid Style */}
            <section id="apropos" className="py-32 bg-white relative overflow-hidden">
                <div className="container mx-auto px-6">
                    {/* Part 1: Project Overview */}
                    <div className="max-w-4xl mx-auto text-center mb-24">
                        <motion.span
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            className="text-sm font-bold uppercase tracking-widest text-blue-600 mb-4 block"
                        >
                            A propos
                        </motion.span>
                        <motion.h2
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: 0.1 }}
                            className="text-5xl md:text-6xl font-bold text-[#152b68] mb-8 leading-tight"
                        >
                            Projet de Blockchain & Cryptomonnaie
                        </motion.h2>

                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: 0.15 }}
                            className="mb-10"
                        >
                            <h3 className="text-2xl font-bold text-blue-600 mb-4">Sujet : Certification de présence à des événements - Groupe 7</h3>
                            <p className="text-xl text-slate-500 leading-relaxed max-w-3xl mx-auto">
                                GouvChain ne génère pas seulement, il vérifie aussi si le document est authentique.
                                Une solution décentralisée garantissant une authenticité irréfutable.
                            </p>
                        </motion.div>

                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: 0.2 }}
                            className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto mb-20"
                        >
                            {/* Promotion */}
                            <div className="flex flex-col items-center p-8 bg-white rounded-3xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow">
                                <div className="p-4 bg-blue-50 rounded-2xl mb-6">
                                    <GraduationCap className="w-8 h-8 text-blue-600" />
                                </div>
                                <span className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-2">Promotion</span>
                                <span className="text-lg font-bold text-[#152b68]">MASTER 1 <br />Sécurité Info & Réseaux</span>
                            </div>

                            {/* Professeur */}
                            <div className="flex flex-col items-center p-8 bg-white rounded-3xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow">
                                <div className="p-4 bg-blue-50 rounded-2xl mb-6">
                                    <Award className="w-8 h-8 text-blue-600" />
                                </div>
                                <span className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-2">Professeur</span>
                                <span className="text-lg font-bold text-[#152b68]">Prof. KASENGEDIA MOTUMBE Pierre</span>
                            </div>

                            {/* Collaborateur */}
                            <div className="flex flex-col items-center p-8 bg-white rounded-3xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow">
                                <div className="p-4 bg-blue-50 rounded-2xl mb-6">
                                    <Users className="w-8 h-8 text-blue-600" />
                                </div>
                                <span className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-2">Collaborateur</span>
                                <span className="text-lg font-bold text-[#152b68]">KANINGINI Junior</span>
                            </div>
                        </motion.div>

                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: 0.3 }}
                            className="flex flex-col items-center mb-16"
                        >
                            <h4 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-6">Technologies utilisées</h4>
                            <div className="flex flex-wrap justify-center gap-4">
                                {[
                                    { name: "Smart Contract", icon: FileKey },
                                    { name: "IPFS", icon: Database },
                                    { name: "Web3.js", icon: Network },
                                    { name: "React.js", icon: Code2 }
                                ].map((tech, i) => (
                                    <div key={i} className="flex items-center gap-3 px-6 py-3 bg-white border border-slate-200 rounded-xl shadow-sm hover:border-blue-500 hover:shadow-md hover:-translate-y-1 transition-all duration-300 cursor-default group">
                                        <div className="p-2 bg-blue-50 rounded-lg group-hover:bg-blue-100 transition-colors">
                                            <tech.icon className="w-6 h-6 text-[#152B68]" />
                                        </div>
                                        <span className="font-semibold text-slate-700 group-hover:text-blue-600 transition-colors">{tech.name}</span>
                                    </div>
                                ))}
                            </div>
                            <a href="/login">
                                <Button variant="ghost" className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors">
                                    Agent Portal
                                </Button>
                            </a>
                        </motion.div>
                    </div>

                    {/* Part 2: Team */}
                    <div className="max-w-7xl mx-auto">
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            className="text-center mb-16"
                        >
                            <h3 className="text-3xl md:text-4xl font-bold text-[#152b68]">L'équipe de réalisation</h3>
                            <p className="text-slate-500 mt-4 text-lg">Les esprits derrière le projet.</p>
                        </motion.div>

                        <div className="grid md:grid-cols-3 gap-10">
                            {[
                                {
                                    name: "MALEKA MUMPUTU Michel",
                                    role: "Étudiant",
                                    image: "/Michel Maleka M.png"
                                },
                                {
                                    name: "KABONGO TSHISHIMBI Gilva",
                                    role: "Étudiant",
                                    image: "/GILVA KABONGO.jpg"
                                },
                                {
                                    name: "KALONDA YAMULAMBA Fiston",
                                    role: "Étudiant",
                                    image: "/FISTON KABONGO.jpg"
                                }
                            ].map((student, index) => (
                                <motion.div
                                    key={index}
                                    initial={{ opacity: 0, y: 20 }}
                                    whileInView={{ opacity: 1, y: 0 }}
                                    viewport={{ once: true }}
                                    transition={{ delay: index * 0.1 }}
                                    className="group cursor-pointer"
                                >
                                    <div className="relative overflow-hidden rounded-2xl mb-6 bg-slate-100 aspect-[4/5]">
                                        <img
                                            src={student.image}
                                            alt={student.name}
                                            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105 grayscale group-hover:grayscale-0"
                                        />
                                        <div className="absolute inset-0 bg-gradient-to-t from-[#152b68]/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end p-6">
                                            <p className="text-white font-medium">Groupe 7</p>
                                        </div>
                                    </div>
                                    <h4 className="text-2xl font-bold text-[#152b68] mb-1 group-hover:text-blue-600 transition-colors">{student.name}</h4>
                                    <span className="text-slate-500 font-medium">{student.role}</span>
                                </motion.div>
                            ))}
                        </div>
                    </div>
                </div>
            </section>

            {/* Verification Section - Digital Trust Hub */}
            <section id="verification" className="py-32 relative overflow-hidden bg-[#0f172a]">
                {/* Dynamic Background */}
                <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-overlay"></div>
                <div className="absolute top-[-10%] left-1/2 -translate-x-1/2 w-[1000px] h-[600px] bg-blue-600/20 rounded-full blur-[120px] pointer-events-none animate-pulse" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[800px] h-[600px] bg-indigo-600/20 rounded-full blur-[100px] pointer-events-none" />

                <div className="container mx-auto px-6 relative z-10">
                    <div className="max-w-4xl mx-auto text-center mb-16">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9 }}
                            whileInView={{ opacity: 1, scale: 1 }}
                            viewport={{ once: true }}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 font-medium text-sm mb-6"
                        >
                            <ShieldCheck className="w-4 h-4" />
                            Système de Vérification Officiel
                        </motion.div>
                        <motion.h2
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            className="text-3xl md:text-4xl lg:text-6xl font-bold text-white mb-6 tracking-tight"
                        >
                            Authenticité <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-400">Certifiée</span>
                        </motion.h2>
                        <motion.p
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: 0.1 }}
                            className="text-xl text-slate-400 max-w-2xl mx-auto leading-relaxed"
                        >
                            Vérifiez l'intégrité de vos documents en temps réel grâce à la puissance de la blockchain.
                        </motion.p>
                    </div>

                    <div className="max-w-3xl mx-auto">
                        <motion.div
                            initial={{ opacity: 0, y: 30 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            className="relative group"
                        >
                            {/* Glowing Border Effect */}
                            <div className="absolute -inset-1 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-2xl blur opacity-25 group-hover:opacity-50 transition duration-1000 group-hover:duration-200" />

                            <div className="relative bg-[#1e293b]/80 backdrop-blur-xl border border-white/10 rounded-2xl p-2 shadow-2xl">
                                <form onSubmit={handleVerify} className="flex flex-col sm:flex-row gap-2">
                                    <div className="relative flex-1">
                                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 h-5 w-5" />
                                        <Input
                                            placeholder="Entrez l'ID unique ou le hash IPFS du certificat..."
                                            className="pl-12 h-14 text-lg bg-transparent border-transparent text-white placeholder:text-slate-500 focus:ring-0 focus:bg-white/5 rounded-xl transition-all"
                                            value={verificationId}
                                            onChange={(e) => setVerificationId(e.target.value)}
                                        />
                                    </div>
                                    <Button
                                        type="submit"
                                        size="lg"
                                        className="h-14 px-8 bg-blue-600 hover:bg-blue-500 text-white font-bold text-lg rounded-xl shadow-lg shadow-blue-600/20 transition-all"
                                        disabled={loading}
                                    >
                                        {loading ? (
                                            <div className="flex items-center gap-2">
                                                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                                <span>Analyse...</span>
                                            </div>
                                        ) : (
                                            'Vérifier'
                                        )}
                                    </Button>
                                </form>
                            </div>
                        </motion.div>

                        {/* Result Display - Digital Certificate Style */}
                        <AnimatePresence>
                            {verificationResult && (
                                <motion.div
                                    initial={{ opacity: 0, y: 40, scale: 0.95 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    exit={{ opacity: 0, y: 20, scale: 0.95 }}
                                    transition={{ type: "spring", duration: 0.6 }}
                                    className="mt-12"
                                >
                                    <div className="relative bg-white text-slate-900 rounded-xl shadow-2xl overflow-hidden max-w-5xl mx-auto border-[8px] border-double border-slate-200">
                                        {/* Decorative Header */}
                                        <div className="bg-[#152b68] text-white p-6 text-center relative overflow-hidden">
                                            <div className="absolute top-0 left-0 w-full h-full opacity-10 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')]"></div>
                                            <div className="relative z-10 flex flex-col items-center">
                                                <img src="/logo2026 white.png" alt="Logo" className="h-12 mb-3 opacity-90" />
                                                <h3 className="text-xl font-serif tracking-widest uppercase">Certificat Officiel</h3>
                                            </div>
                                        </div>

                                        {/* Certificate Body */}
                                        <div className="p-8 md:p-10 relative">
                                            {/* Watermark */}
                                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.03]">
                                                <img src="/logo2026.png" className="w-64 h-64 grayscale" alt="Watermark" />
                                            </div>

                                            {verificationResult.status === 'valid' ? (
                                                <>
                                                    <div className="relative z-10 flex flex-col md:flex-row gap-8 items-start text-left">
                                                        {/* Left Column: Status & Icon */}
                                                        <div className="w-full md:w-1/3 flex flex-col items-center md:items-start text-center md:text-left space-y-4 border-b md:border-b-0 md:border-r border-slate-100 pb-6 md:pb-0 md:pr-6">
                                                            <div className="inline-block p-3 rounded-full bg-emerald-100 text-emerald-600 mb-2 ring-4 ring-emerald-50">
                                                                <CheckCircle className="w-12 h-12" />
                                                            </div>
                                                            <div>
                                                                <h4 className="text-2xl font-bold text-[#152b68] mb-2">Document Authentique</h4>
                                                                <p className="text-slate-500 text-sm leading-relaxed">
                                                                    Ce document a été vérifié et certifié conforme sur la blockchain GouvChain.
                                                                    Son intégrité est garantie.
                                                                </p>
                                                            </div>
                                                        </div>

                                                        {/* Right Column: Details */}
                                                        <div className="w-full md:w-2/3 space-y-8 pt-6 md:pt-0">
                                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-8">
                                                                {/* Bénéficiaire */}
                                                                <div className="border-l-4 border-blue-500/20 pl-4">
                                                                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">Bénéficiaire</span>
                                                                    <span className="text-xl font-bold text-[#152b68] break-words">
                                                                        {verificationResult.beneficiary}
                                                                    </span>
                                                                </div>

                                                                {/* Événement */}
                                                                <div className="border-l-4 border-blue-500/20 pl-4">
                                                                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">Événement Certifié</span>
                                                                    <span className="text-xl font-bold text-[#152b68]">
                                                                        {verificationResult.event}
                                                                    </span>
                                                                </div>

                                                                {/* Émetteur */}
                                                                <div className="border-l-4 border-blue-500/20 pl-4">
                                                                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">Émetteur Officiel</span>
                                                                    <span className="text-xl font-bold text-[#152b68]">
                                                                        {verificationResult.issuer}
                                                                    </span>
                                                                </div>

                                                                {/* Date */}
                                                                <div className="border-l-4 border-blue-500/20 pl-4">
                                                                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">Date d'émission</span>
                                                                    <span className="text-xl font-bold text-[#152b68]">
                                                                        {(() => {
                                                                            try {
                                                                                const dateObj = new Date(verificationResult.date);
                                                                                if (isNaN(dateObj.getTime())) return verificationResult.date;
                                                                                return dateObj.toLocaleDateString('fr-FR', {
                                                                                    day: 'numeric',
                                                                                    month: 'long',
                                                                                    year: 'numeric'
                                                                                });
                                                                            } catch (e) {
                                                                                return verificationResult.date;
                                                                            }
                                                                        })()}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    {/* Download Button - Centered below both columns */}
                                                    <div className="flex justify-center mt-10">
                                                        <Button
                                                            size="lg"
                                                            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-8 py-6 rounded-xl shadow-lg transition-all hover:shadow-xl"
                                                            onClick={() => window.open(verificationResult.ipfsLink, '_blank')}
                                                        >
                                                            <Download className="w-5 h-5 mr-2" />
                                                            Télécharger la preuve (PDF)
                                                        </Button>
                                                    </div>
                                                </>
                                            ) : (
                                                <div className="relative z-10 text-center space-y-6 py-8">
                                                    <div className="inline-block p-3 rounded-full bg-slate-100 text-slate-500 mb-2 ring-4 ring-slate-50">
                                                        <Search className="w-16 h-16" />
                                                    </div>
                                                    <div>
                                                        <h4 className="text-3xl font-bold text-slate-700 mb-2">Introuvable</h4>
                                                        <p className="text-slate-500 max-w-md mx-auto">Aucun certificat ne correspond à cet identifiant. Veuillez vérifier votre saisie.</p>
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        {/* Decorative Bottom Bar */}
                                        <div className="h-2 bg-gradient-to-r from-blue-500 via-[#152b68] to-indigo-500"></div>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>
            </section>

            {/* FAQs Section */}
            <section id="faqs" className="py-24 bg-slate-50">
                <div className="container mx-auto px-6 max-w-4xl">
                    <div className="text-center mb-16">
                        <motion.h2
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            className="text-4xl font-bold text-[#152b68] mb-6"
                        >
                            Questions Fréquentes
                        </motion.h2>
                        <p className="text-xl text-slate-500">
                            Tout ce que vous devez savoir sur la vérification de documents.
                        </p>
                    </div>

                    <div className="space-y-4">
                        {[
                            {
                                question: "Comment vérifier l'authenticité d'un document ?",
                                answer: "Il vous suffit d'entrer l'identifiant unique (Hash) présent sur le document dans la barre de recherche ci-dessus. Le système interrogera la blockchain pour confirmer sa validité."
                            },
                            {
                                question: "Quels types de documents peuvent être vérifiés ?",
                                answer: "GouvChain prend en charge tous types de documents officiels : diplômes, actes de naissance, titres de propriété, certificats de mariage, etc."
                            },
                            {
                                question: "La vérification est-elle gratuite ?",
                                answer: "Oui, la vérification de documents est un service public entièrement gratuit et accessible à tous, 24h/24 et 7j/7."
                            },
                            {
                                question: "Que faire si je perds le hash (ID) de mon certificat ?",
                                answer: "L'identifiant unique est irrécupérable s'il n'est pas sauvegardé et que vous ne l'avez plus. Veuillez contacter l'administrateur."
                            }
                        ].map((faq, index) => (
                            <motion.div
                                key={index}
                                initial={{ opacity: 0, y: 10 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ delay: index * 0.1 }}
                                className="bg-white rounded-xl border border-slate-200 overflow-hidden"
                            >
                                <details className="group">
                                    <summary className="flex justify-between items-center font-medium cursor-pointer list-none p-6 text-[#152b68] text-lg hover:bg-slate-50 transition-colors">
                                        <span>{faq.question}</span>
                                        <span className="transition group-open:rotate-180">
                                            <ChevronDown className="h-5 w-5 text-[#152b68]" />
                                        </span>
                                    </summary>
                                    <div className="text-slate-500 px-6 pb-6 pt-0 leading-relaxed">
                                        {faq.answer}
                                    </div>
                                </details>
                            </motion.div>
                        ))}
                    </div>
                </div>

            </section>

            {/* Footer */}
            <footer className="bg-[#152b68] text-white py-20 border-t border-white/10">
                <div className="max-w-7xl mx-auto px-6 flex flex-col items-center text-center">
                    {/* Brand */}
                    <div className="flex flex-col items-center gap-6 mb-12">
                        <img src="/logo2026 white.png" alt="GouvChain Logo" className="h-20 w-auto" />
                        <p className="text-slate-300 max-w-md text-lg leading-relaxed">
                            La première plateforme décentralisée de certification académique et professionnelle.
                        </p>
                    </div>

                    {/* Navigation */}
                    <div className="flex flex-wrap justify-center gap-8 mb-6 text-slate-300">
                        {navItems.map((item, i) => (
                            <a key={i} href={item.link} className="hover:text-white transition-colors font-medium text-lg">
                                {item.name}
                            </a>
                        ))}
                    </div>

                    {/* Legal */}
                    <div className="flex flex-wrap justify-center gap-8 mb-12 text-slate-400 text-sm">
                        {["Mentions légales", "Confidentialité", "Contact"].map((item, i) => (
                            <a key={i} href="#" className="hover:text-white transition-colors">
                                {item}
                            </a>
                        ))}
                    </div>

                    {/* Socials */}
                    <div className="flex gap-6 mb-12">
                        {[Facebook, Github, Linkedin, Twitter].map((Icon, i) => (
                            <a key={i} href="#" className="p-3 bg-white/5 rounded-full hover:bg-blue-500 hover:text-white transition-all duration-300 group">
                                <Icon className="w-6 h-6 text-slate-300 group-hover:text-white" />
                            </a>
                        ))}
                    </div>

                    {/* Copyright */}
                    <div className="text-slate-500 text-sm">
                        <p>© 2025 GouvChain. Tous droits réservés.</p>
                        <p className="mt-2 text-slate-400">Fait par le groupe 7</p>
                    </div>
                </div>
            </footer>
        </div>
    );
};

export default LandingPage;
