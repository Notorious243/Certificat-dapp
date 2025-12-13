const fs = require('fs');
const { exec } = require('child_process');
const path = require('path');

const markdownFile = process.argv[2] || 'Rapport_Projet.md';
const outputFile = markdownFile.replace('.md', '.pdf');

console.log(`Converting ${markdownFile} to PDF...`);

// Utiliser md-to-pdf avec configuration simple
const command = `npx -y md-to-pdf "${markdownFile}" --config-file /dev/null --launch-options '{"args": ["--no-sandbox"]}'`;

exec(command, (error, stdout, stderr) => {
    if (error) {
        console.error(`Error: ${error.message}`);

        // Fallback: essayer avec marked-pdf
        console.log('Trying alternative method...');
        const altCommand = `npx -y markdown-pdf "${markdownFile}" -o "${outputFile}"`;

        exec(altCommand, (err2, out2, err2msg) => {
            if (err2) {
                console.error('Alternative method also failed:', err2.message);
                console.log('\nPlease install one of these tools manually:');
                console.log('1. brew install pandoc');
                console.log('2. npm install -g md-to-pdf');
                process.exit(1);
            } else {
                console.log('✅ PDF created successfully:', outputFile);
            }
        });
        return;
    }

    if (stderr) {
        console.error(`Warning: ${stderr}`);
    }

    console.log(stdout);
    console.log('✅ PDF created successfully:', outputFile);
});
