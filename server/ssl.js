const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const CERTS_DIR = path.join(__dirname, '..', 'certs');

function getLocalIpAddresses() {
  const ips = ['127.0.0.1', 'localhost'];
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        ips.push(iface.address);
      }
    }
  }
  return ips;
}

function ensureCertificates() {
  if (!fs.existsSync(CERTS_DIR)) {
    fs.mkdirSync(CERTS_DIR, { recursive: true });
  }

  const caKeyPath = path.join(CERTS_DIR, 'ca.key');
  const caCrtPath = path.join(CERTS_DIR, 'ca.crt');
  const serverKeyPath = path.join(CERTS_DIR, 'server.key');
  const serverCsrPath = path.join(CERTS_DIR, 'server.csr');
  const serverCrtPath = path.join(CERTS_DIR, 'server.crt');
  const extConfigPath = path.join(CERTS_DIR, 'server.ext');

  // If server certificate and key already exist and are valid, return them
  if (fs.existsSync(serverKeyPath) && fs.existsSync(serverCrtPath) && fs.existsSync(caCrtPath)) {
    try {
      return {
        key: fs.readFileSync(serverKeyPath),
        cert: fs.readFileSync(serverCrtPath),
        ca: fs.readFileSync(caCrtPath),
        caPath: caCrtPath,
        localIps: getLocalIpAddresses()
      };
    } catch (e) {
      console.warn('Could not read existing certificates, re-generating...', e.message);
    }
  }

  console.log('Generating SSL certificates for HTTPS (supporting localhost & local LAN IPs)...');

  const localIps = getLocalIpAddresses();
  console.log('Detected local network addresses for SSL SAN:', localIps);

  // Build SAN configuration
  let sanEntries = [];
  let ipIndex = 1;
  let dnsIndex = 1;

  for (const item of localIps) {
    if (/^\d+\.\d+\.\d+\.\d+$/.test(item)) {
      sanEntries.push(`IP.${ipIndex++} = ${item}`);
    } else {
      sanEntries.push(`DNS.${dnsIndex++} = ${item}`);
    }
  }

  // Also include general wildcards/names
  sanEntries.push(`DNS.${dnsIndex++} = *.local`);
  sanEntries.push(`DNS.${dnsIndex++} = radiophone.local`);

  const extContent = `
authorityKeyIdentifier=keyid,issuer
basicConstraints=CA:FALSE
keyUsage = digitalSignature, nonRepudiation, keyEncipherment, dataEncipherment
subjectAltName = @alt_names

[alt_names]
${sanEntries.join('\n')}
`;

  fs.writeFileSync(extConfigPath, extContent.trim());

  // 1. Generate Root CA Key & Self-Signed CA Certificate
  if (!fs.existsSync(caKeyPath) || !fs.existsSync(caCrtPath)) {
    execSync(`openssl genrsa -out "${caKeyPath}" 2048`, { stdio: 'ignore' });
    execSync(`openssl req -x509 -new -nodes -key "${caKeyPath}" -sha256 -days 3650 -out "${caCrtPath}" -subj "/CN=Radiophone Infrasound Root CA/O=Radiophone/C=TR"`, { stdio: 'ignore' });
  }

  // 2. Generate Server Key & CSR
  execSync(`openssl genrsa -out "${serverKeyPath}" 2048`, { stdio: 'ignore' });
  execSync(`openssl req -new -key "${serverKeyPath}" -out "${serverCsrPath}" -subj "/CN=Radiophone Infrasound Station/O=Radiophone/C=TR"`, { stdio: 'ignore' });

  // 3. Sign the Server Certificate with our Root CA
  execSync(`openssl x509 -req -in "${serverCsrPath}" -CA "${caCrtPath}" -CAkey "${caKeyPath}" -CAcreateserial -out "${serverCrtPath}" -days 825 -sha256 -extfile "${extConfigPath}"`, { stdio: 'ignore' });

  console.log('SSL Certificates generated successfully in:', CERTS_DIR);

  return {
    key: fs.readFileSync(serverKeyPath),
    cert: fs.readFileSync(serverCrtPath),
    ca: fs.readFileSync(caCrtPath),
    caPath: caCrtPath,
    localIps
  };
}

module.exports = {
  ensureCertificates,
  getLocalIpAddresses,
  CERTS_DIR
};
