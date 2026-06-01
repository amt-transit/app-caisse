// Config Metro standard Expo. Définie explicitement ici pour ne PAS hériter
// d'un metro.config.js d'un dossier parent (le repo racine) qui n'étend pas
// expo/metro-config.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

module.exports = config;
