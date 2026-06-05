import dotenv from 'dotenv';

const result = dotenv.config();

if (!result.error) {
  console.log('[qa-lab-server] dotenv loaded=true path=.env');
} else {
  console.warn(`[qa-lab-server] dotenv error=${result.error.message}`);
}
