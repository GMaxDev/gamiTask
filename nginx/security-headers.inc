# Inclus au niveau server et dans chaque location qui pose son propre add_header.
# CSP : le site lui-même, Google Sign-In (script, iframe, connexions), Google Fonts, et le socket en wss.
add_header Content-Security-Policy "default-src 'self'; script-src 'self' https://accounts.google.com; frame-src https://accounts.google.com; connect-src 'self' wss: https://accounts.google.com; img-src 'self' data: https:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com; font-src 'self' https://fonts.gstatic.com; object-src 'none'; base-uri 'self'; frame-ancestors 'none'" always;
add_header X-Frame-Options "DENY" always;
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
# HSTS : TLS est terminé en amont (proxy/hébergeur) ; l'en-tête ne vaut que sur une réponse servie en https.
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
