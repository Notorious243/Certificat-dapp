import axios from 'axios';


import { PINATA_CONFIG } from '../config';

// Récupération des clés depuis la configuration
const { JWT, API_KEY, SECRET_API_KEY } = PINATA_CONFIG;

export const uploadToIPFS = async (file) => {
    if (!file) return null;

    const formData = new FormData();
    formData.append('file', file);

    const metadata = JSON.stringify({
        name: file.name,
        keyvalues: {
            type: "attestation",
            issuer: "GouvChain"
        }
    });
    formData.append('pinataMetadata', metadata);

    const options = JSON.stringify({
        cidVersion: 0,
    });
    formData.append('pinataOptions', options);

    try {
        // Configuration des headers selon la méthode d'authentification choisie
        const headers = {
            'Content-Type': `multipart/form-data; boundary=${formData._boundary}`,
        };

        if (JWT && JWT !== "VOTRE_JWT_ICI") {
            headers['Authorization'] = `Bearer ${JWT}`;
        } else if (API_KEY && API_KEY !== "VOTRE_API_KEY_ICI") {
            headers['pinata_api_key'] = API_KEY;
            headers['pinata_secret_api_key'] = SECRET_API_KEY;
        } else {
            throw new Error("Clés API Pinata manquantes. Veuillez configurer src/config.js");
        }

        const res = await axios.post("https://api.pinata.cloud/pinning/pinFileToIPFS", formData, {
            headers: headers
        });

        console.log("Fichier uploadé sur IPFS:", res.data);
        return res.data.IpfsHash;

    } catch (error) {
        console.error("Erreur upload IPFS:", error);
        throw error;
    }
};

export const unpinFromIPFS = async (hash) => {
    if (!hash) return;

    try {
        const headers = {};
        if (JWT && JWT !== "VOTRE_JWT_ICI") {
            headers['Authorization'] = `Bearer ${JWT}`;
        } else if (API_KEY && API_KEY !== "VOTRE_API_KEY_ICI") {
            headers['pinata_api_key'] = API_KEY;
            headers['pinata_secret_api_key'] = SECRET_API_KEY;
        }

        await axios.delete(`https://api.pinata.cloud/pinning/unpin/${hash}`, {
            headers: headers
        });
        console.log("Fichier supprimé de IPFS (Unpinned):", hash);
    } catch (error) {
        console.error("Erreur lors de la suppression IPFS:", error);
    }
};
