import React from 'react';
import { QRCodeSVG } from 'qrcode.react';

const CertificatePreview = ({
    beneficiaire = '',
    motif = '',
    date = '',
    organisme = 'Ministère du Numérique',
    ipfsHash = ''
}) => {
    // Format de la date
    const formattedDate = date ? new Date(date).toLocaleDateString('fr-FR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    }) : '26 novembre 2025';

    // Génération d'un ID court pour l'affichage
    const displayId = ipfsHash ? ipfsHash.substring(0, 16).toUpperCase() : 'ID-UNIQUE-123456';

    return (
        <div className="w-full h-full flex items-center justify-center p-4 bg-slate-100 font-sans">
            {/* Cadre Principal */}
            {/* Cadre Principal avec Container Query */}
            <div
                className="relative w-full max-w-[800px] aspect-[1.414/1] bg-white rounded-3xl shadow-2xl border border-slate-300 overflow-hidden flex flex-col"
                style={{ containerType: 'inline-size' }}
            >

                {/* Motif Vagues (Coins) - Simulation CSS */}
                <div className="absolute top-0 left-0 w-[20cqw] h-[20cqw] opacity-20 pointer-events-none">
                    <div className="w-full h-full border-[1px] border-blue-600 rounded-full absolute -top-1/2 -left-1/2 scale-[1.5]"></div>
                    <div className="w-full h-full border-[1px] border-blue-600 rounded-full absolute -top-1/2 -left-1/2 scale-[2.0]"></div>
                    <div className="w-full h-full border-[1px] border-blue-600 rounded-full absolute -top-1/2 -left-1/2 scale-[2.5]"></div>
                    <div className="w-full h-full border-[1px] border-blue-600 rounded-full absolute -top-1/2 -left-1/2 scale-[3.0]"></div>
                </div>
                <div className="absolute top-0 right-0 w-[20cqw] h-[20cqw] opacity-20 pointer-events-none">
                    <div className="w-full h-full border-[1px] border-blue-600 rounded-full absolute -top-1/2 -right-1/2 scale-[1.5]"></div>
                    <div className="w-full h-full border-[1px] border-blue-600 rounded-full absolute -top-1/2 -right-1/2 scale-[2.0]"></div>
                    <div className="w-full h-full border-[1px] border-blue-600 rounded-full absolute -top-1/2 -right-1/2 scale-[2.5]"></div>
                </div>

                {/* Contenu Principal */}
                <div className="relative z-10 flex flex-col items-center justify-between h-full py-[5cqw] px-[6cqw]">

                    {/* En-tête : Logo & République */}
                    <div className="flex flex-col items-center text-center space-y-[1cqw]">
                        <img
                            src="/logo certificat.png"
                            alt="Emblème RDC"
                            className="w-[12cqw] h-auto object-contain drop-shadow-sm"
                        />
                    </div>

                    {/* Titre Principal */}
                    <div className="text-center w-full">
                        <h1 className="font-bold text-[#1e3a8a] uppercase tracking-wide mb-[0.5cqw] font-serif whitespace-nowrap" style={{ fontSize: '4.5cqw' }}>
                            Certificat de Présence
                        </h1>
                        <div className="w-[25cqw] h-[0.25cqw] bg-[#1e3a8a] mx-auto opacity-50 mb-[2cqw]"></div>

                        {/* Délivré à */}
                        <p className="text-slate-500 font-medium mb-[0.5cqw] uppercase tracking-widest" style={{ fontSize: '1.5cqw' }}>
                            Délivré à :
                        </p>

                        {/* Nom du Bénéficiaire */}
                        <h2 className="font-bold text-[#1e3a8a] mb-[2cqw] text-center break-words w-full leading-tight" style={{ fontSize: '4cqw' }}>
                            {beneficiaire || 'NOM DU PARTICIPANT'}
                        </h2>

                        {/* Corps du texte */}
                        <div className="max-w-[80%] mx-auto text-center leading-relaxed text-slate-600" style={{ fontSize: '1.8cqw' }}>
                            <p>
                                Ce certificat atteste que le titulaire a participé avec succès à <strong className="text-slate-900">{motif || 'l\'événement'}</strong>,
                            </p>
                            <p className="mt-[0.5cqw]">
                                organisé par <strong className="text-slate-900">{organisme}</strong>.
                            </p>
                            <p className="italic text-slate-400 mt-[1.5cqw]" style={{ fontSize: '1.4cqw' }}>
                                La présence est certifiée via la blockchain GouvChain, garantissant une authenticité irréfutable.
                            </p>
                        </div>
                    </div>

                    {/* Pied de page : Signatures & QR */}
                    <div className="w-full grid grid-cols-3 items-end mt-[2cqw]">

                        {/* Signature Gauche */}
                        <div className="text-center">
                            <div className="h-[6cqw] flex items-end justify-center mb-[1cqw]">
                                <span className="font-serif text-[#1e3a8a] italic" style={{ fontSize: '2.5cqw' }}>GouvChain</span>
                            </div>
                            <div className="h-[1px] w-[15cqw] bg-slate-300 mx-auto mb-[0.5cqw]"></div>
                            <p className="font-bold text-slate-700 uppercase tracking-tighter" style={{ fontSize: '1.2cqw' }}>Directeur de l'événement</p>
                        </div>

                        {/* Date & ID Central */}
                        <div className="text-center flex flex-col items-center justify-end pb-[1cqw]">
                            <p className="text-slate-400 mb-[0.25cqw]" style={{ fontSize: '1.2cqw' }}>Délivré le</p>
                            <p className="font-bold text-slate-800 mb-[1.5cqw]" style={{ fontSize: '1.8cqw' }}>{formattedDate}</p>

                            <p className="text-slate-400 mb-[0.25cqw]" style={{ fontSize: '1cqw' }}>ID Unique</p>
                            <div className="bg-slate-100 px-[1cqw] py-[0.5cqw] rounded border border-slate-200 font-mono text-slate-600 tracking-wider" style={{ fontSize: '1.1cqw' }}>
                                {displayId}
                            </div>
                        </div>

                        {/* QR Code Droite */}
                        <div className="flex flex-col items-center justify-end">
                            <div className="bg-white p-[0.5cqw] border border-slate-200 rounded shadow-sm">
                                <QRCodeSVG
                                    value={`https://gouvchain.rdc/verify/${displayId}`}
                                    size={100} // Base size, will be controlled by CSS scale if needed, but SVG scales well. 
                                    // Actually QRCodeSVG 'size' is pixel width. We need it responsive.
                                    // We can use style={{ width: '12cqw', height: '12cqw' }}
                                    style={{ width: '12cqw', height: '12cqw' }}
                                    level="H"
                                    fgColor="#1e3a8a"
                                />
                            </div>
                            <p className="text-[#1e3a8a] font-bold mt-[0.5cqw]" style={{ fontSize: '1cqw' }}>Vérifier sur GouvChain</p>
                        </div>
                    </div>
                </div>

                {/* Bande décorative bas */}
                <div className="absolute bottom-0 left-0 w-full h-[1.5cqw] bg-gradient-to-r from-[#1e3a8a] via-blue-600 to-[#1e3a8a]"></div>
            </div>
        </div>
    );
};

export default CertificatePreview;
