#!/bin/bash
# Génère un certificat auto-signé pour tester en HTTPS sur le réseau local
# (nécessaire au vocal WebRTC sur téléphone hors localhost)
cd "$(dirname "$0")/.."
mkdir -p certs
IP=$(ip -4 addr show | grep -oP 'inet \K192\.168\.[0-9.]+|inet \K10\.[0-9.]+|inet \K172\.(1[6-9]|2[0-9]|3[01])\.[0-9.]+' | head -1)
IP=${IP:-127.0.0.1}
echo "Certificat pour IP locale : $IP"
openssl req -x509 -newkey rsa:2048 -nodes \
  -keyout certs/key.pem -out certs/cert.pem -days 365 \
  -subj "/CN=ktane-local" \
  -addext "subjectAltName=IP:$IP,IP:127.0.0.1,DNS:localhost"
echo "OK → certs/key.pem + certs/cert.pem"
echo "Le serveur écoutera aussi en HTTPS sur :8443"
echo "Sur le téléphone : ouvrir https://$IP:8443 et accepter l'avertissement de sécurité."
