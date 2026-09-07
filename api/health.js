export default function handler(_request, response) {
  response.status(200).json({
    ok: true,
    service: 'naki-bot-companion',
    message: 'NAKI companion API is running. The Discord Gateway bot must run on an always-on host.',
    timestamp: new Date().toISOString(),
  });
}