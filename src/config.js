// Configuration centralisée pour l'application

// =============================================================================
// 1. CONFIGURATION IPFS (PINATA)
// =============================================================================
// Obtenez vos clés sur : https://app.pinata.cloud/developers/api-keys
export const PINATA_CONFIG = {
	// Méthode recommandée : JWT (JSON Web Token)
	JWT: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySW5mb3JtYXRpb24iOnsiaWQiOiIzZTgyZmFhOC1hZGY4LTQyNDgtYTVlNC0zY2FiOWViYWM0YjUiLCJlbWFpbCI6Im1pY2hlbC5tYWxla2ExQGdtYWlsLmNvbSIsImVtYWlsX3ZlcmlmaWVkIjp0cnVlLCJwaW5fcG9saWN5Ijp7InJlZ2lvbnMiOlt7ImRlc2lyZWRSZXBsaWNhdGlvbkNvdW50IjoxLCJpZCI6IkZSQTEifSx7ImRlc2lyZWRSZXBsaWNhdGlvbkNvdW50IjoxLCJpZCI6Ik5ZQzEifV0sInZlcnNpb24iOjF9LCJtZmFfZW5hYmxlZCI6ZmFsc2UsInN0YXR1cyI6IkFDVElWRSJ9LCJhdXRoZW50aWNhdGlvblR5cGUiOiJzY29wZWRLZXkiLCJzY29wZWRLZXlLZXkiOiI4ZDE0N2UxMDYxOGVmYzBiYzFiMSIsInNjb3BlZEtleVNlY3JldCI6IjcwMzQxMzY3NTFmNjRmNDYyOGVjNDZiMjBiNzZkMDA1MDMwYTdmOWZjOWZlNDkzZmU4YTA2ZGU5MTgzNTU3ZDYiLCJleHAiOjE3OTcxMTQ1OTR9.AYdwamrJD_JbuudpBAWfob_MoXvT9m43Tv_at0mpV9M",

	// Méthode alternative : API Key + Secret
	API_KEY: "8d147e10618efc0bc1b1",
	SECRET_API_KEY: "7034136751f64f4628ec46b20b76d005030a7f9fc9fe493fe8a06de9183557d6"
};

// =============================================================================
// 2. CONFIGURATION BLOCKCHAIN (SMART CONTRACT)
// =============================================================================

// Adresse du contrat déployé (ex: sur Sepolia)
export const CONTRACT_ADDRESS = "0x2c777273e8ba3e19a4BC93A6A7bfed00Bdc2B99F"; // À REMPLACER

// Adresse de l'administrateur (optionnel, pour contrôles front-end supplémentaires)
export const ADMIN_ADDRESS = "0x242EC2980Df1bfbF7d977F13721EE6E2EB01feeD"; // Laisser vide si non utilisé

// URL de l'application (Production)
export const APP_URL = "https://certificat-dapp.vercel.app";

// ABI du contrat (Interface pour interagir avec le contrat)
export const CONTRACT_ABI = [
	{
		"inputs": [],
		"stateMutability": "nonpayable",
		"type": "constructor"
	},
	{
		"anonymous": false,
		"inputs": [
			{
				"indexed": true,
				"internalType": "address",
				"name": "ancien",
				"type": "address"
			},
			{
				"indexed": true,
				"internalType": "address",
				"name": "nouveau",
				"type": "address"
			}
		],
		"name": "AutoriteTransferee",
		"type": "event"
	},
	{
		"anonymous": false,
		"inputs": [
			{
				"indexed": true,
				"internalType": "bytes32",
				"name": "idUnique",
				"type": "bytes32"
			},
			{
				"indexed": false,
				"internalType": "string",
				"name": "hashDocument",
				"type": "string"
			},
			{
				"indexed": false,
				"internalType": "uint256",
				"name": "issuedAt",
				"type": "uint256"
			}
		],
		"name": "CertificatEnregistre",
		"type": "event"
	},
	{
		"inputs": [
			{
				"internalType": "string",
				"name": "_nomBeneficiaire",
				"type": "string"
			},
			{
				"internalType": "string",
				"name": "_titreCertificat",
				"type": "string"
			},
			{
				"internalType": "string",
				"name": "_date",
				"type": "string"
			},
			{
				"internalType": "string",
				"name": "_organisme",
				"type": "string"
			},
			{
				"internalType": "string",
				"name": "_hashDocument",
				"type": "string"
			}
		],
		"name": "enregistrerCertificat",
		"outputs": [
			{
				"internalType": "bytes32",
				"name": "idUnique",
				"type": "bytes32"
			}
		],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "_nouvelleAutorite",
				"type": "address"
			}
		],
		"name": "transfererAutorite",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "autorite",
		"outputs": [
			{
				"internalType": "address",
				"name": "",
				"type": "address"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "bytes32",
				"name": "_idUnique",
				"type": "bytes32"
			}
		],
		"name": "estEnregistre",
		"outputs": [
			{
				"internalType": "bool",
				"name": "",
				"type": "bool"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "bytes32",
				"name": "_idUnique",
				"type": "bytes32"
			}
		],
		"name": "getCertificat",
		"outputs": [
			{
				"internalType": "string",
				"name": "nomBeneficiaire",
				"type": "string"
			},
			{
				"internalType": "string",
				"name": "titreCertificat",
				"type": "string"
			},
			{
				"internalType": "string",
				"name": "dateCert",
				"type": "string"
			},
			{
				"internalType": "string",
				"name": "organisme",
				"type": "string"
			},
			{
				"internalType": "string",
				"name": "hashDocument",
				"type": "string"
			},
			{
				"internalType": "uint256",
				"name": "issuedAt",
				"type": "uint256"
			},
			{
				"internalType": "bool",
				"name": "existe",
				"type": "bool"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "bytes32",
				"name": "_idUnique",
				"type": "bytes32"
			},
			{
				"internalType": "string",
				"name": "_hashDocument",
				"type": "string"
			}
		],
		"name": "verifierHash",
		"outputs": [
			{
				"internalType": "bool",
				"name": "",
				"type": "bool"
			}
		],
		"stateMutability": "view",
		"type": "function"
	}

]


// =============================================================================
// 3. CONFIGURATION EMAILJS (NOTIFICATION)
// =============================================================================
export const EMAILJS_CONFIG = {
	SERVICE_ID: "service_cm7v4zv", // À REMPLACER
	TEMPLATE_ID: "template_kollhet", // À REMPLACER
	PUBLIC_KEY: "Ba3Ek9da4w5QHuGGz" // À REMPLACER
};