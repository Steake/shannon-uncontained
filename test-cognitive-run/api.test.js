/**
 * API Tests - LSG v2 Generated
 * 
 * Target: https://REDACTED_DOMAIN
 * Endpoints: 64
 */

const request = require('supertest');
const app = require('../app'); // Adjust path as needed

describe('API Endpoints', () => {

  describe('en-gb', () => {

    // Confidence: 0.50
    it('should GET /en-gb/learn/defi/token-swaps', async () => {
      const response = await request(app)
        .get('/en-gb/learn/defi/token-swaps')
        
        .set('Accept', 'application/json');
      
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(500);
    });

    // Confidence: 0.50
    it('should GET /en-gb/newsroom/private-blockchains', async () => {
      const response = await request(app)
        .get('/en-gb/newsroom/private-blockchains')
        
        .set('Accept', 'application/json');
      
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(500);
    });
  });

  describe('root', () => {

    // Confidence: 0.50
    it('should GET /', async () => {
      const response = await request(app)
        .get('/')
        
        .set('Accept', 'application/json');
      
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(500);
    });
  });

  describe('trust-pilot', () => {

    // Confidence: 0.50
    it('should GET /api/trust-pilot', async () => {
      const response = await request(app)
        .get('/api/trust-pilot')
        
        .set('Accept', 'application/json');
      
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(500);
    });
  });

  describe('_next', () => {

    // Confidence: 0.50
    it('should GET /_next/data/vHr_mAEa3AYMgNUBTjo4-/en.json', async () => {
      const response = await request(app)
        .get('/_next/data/vHr_mAEa3AYMgNUBTjo4-/en.json')
        
        .set('Accept', 'application/json');
      
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(500);
    });

    // Confidence: 0.50
    it('should GET /_next/data/vHr_mAEa3AYMgNUBTjo4-/en/business.json?slug=business', async () => {
      const response = await request(app)
        .get('/_next/data/vHr_mAEa3AYMgNUBTjo4-/en/business.json?slug=business')
        
        .set('Accept', 'application/json');
      
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(500);
    });

    // Confidence: 0.50
    it('should GET /_next/data/vHr_mAEa3AYMgNUBTjo4-/en/sell.json?slug=sell', async () => {
      const response = await request(app)
        .get('/_next/data/vHr_mAEa3AYMgNUBTjo4-/en/sell.json?slug=sell')
        
        .set('Accept', 'application/json');
      
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(500);
    });

    // Confidence: 0.50
    it('should GET /_next/data/vHr_mAEa3AYMgNUBTjo4-/en/buy.json?slug=buy', async () => {
      const response = await request(app)
        .get('/_next/data/vHr_mAEa3AYMgNUBTjo4-/en/buy.json?slug=buy')
        
        .set('Accept', 'application/json');
      
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(500);
    });

    // Confidence: 0.50
    it('should GET /_next/data/vHr_mAEa3AYMgNUBTjo4-/en/business/onramps.json?slug=onramps', async () => {
      const response = await request(app)
        .get('/_next/data/vHr_mAEa3AYMgNUBTjo4-/en/business/onramps.json?slug=onramps')
        
        .set('Accept', 'application/json');
      
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(500);
    });

    // Confidence: 0.50
    it('should GET /_next/data/vHr_mAEa3AYMgNUBTjo4-/en/business/offramps.json?slug=offramps', async () => {
      const response = await request(app)
        .get('/_next/data/vHr_mAEa3AYMgNUBTjo4-/en/business/offramps.json?slug=offramps')
        
        .set('Accept', 'application/json');
      
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(500);
    });

    // Confidence: 0.50
    it('should GET /_next/data/vHr_mAEa3AYMgNUBTjo4-/en/price.json?slug=price', async () => {
      const response = await request(app)
        .get('/_next/data/vHr_mAEa3AYMgNUBTjo4-/en/price.json?slug=price')
        
        .set('Accept', 'application/json');
      
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(500);
    });

    // Confidence: 0.50
    it('should GET /_next/data/vHr_mAEa3AYMgNUBTjo4-/en/swap.json?slug=swap', async () => {
      const response = await request(app)
        .get('/_next/data/vHr_mAEa3AYMgNUBTjo4-/en/swap.json?slug=swap')
        
        .set('Accept', 'application/json');
      
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(500);
    });

    // Confidence: 0.50
    it('should GET /_next/data/vHr_mAEa3AYMgNUBTjo4-/en/newsroom.json', async () => {
      const response = await request(app)
        .get('/_next/data/vHr_mAEa3AYMgNUBTjo4-/en/newsroom.json')
        
        .set('Accept', 'application/json');
      
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(500);
    });

    // Confidence: 0.50
    it('should GET /_next/data/vHr_mAEa3AYMgNUBTjo4-/en/learn.json?slug=learn', async () => {
      const response = await request(app)
        .get('/_next/data/vHr_mAEa3AYMgNUBTjo4-/en/learn.json?slug=learn')
        
        .set('Accept', 'application/json');
      
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(500);
    });

    // Confidence: 0.50
    it('should GET /_next/data/vHr_mAEa3AYMgNUBTjo4-/en/swap/sol.json?slug=sol', async () => {
      const response = await request(app)
        .get('/_next/data/vHr_mAEa3AYMgNUBTjo4-/en/swap/sol.json?slug=sol')
        
        .set('Accept', 'application/json');
      
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(500);
    });

    // Confidence: 0.50
    it('should GET /_next/data/vHr_mAEa3AYMgNUBTjo4-/en/buy/sol.json?slug=buy&slug=sol', async () => {
      const response = await request(app)
        .get('/_next/data/vHr_mAEa3AYMgNUBTjo4-/en/buy/sol.json?slug=buy&slug=sol')
        
        .set('Accept', 'application/json');
      
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(500);
    });

    // Confidence: 0.50
    it('should GET /_next/data/vHr_mAEa3AYMgNUBTjo4-/en/security.json', async () => {
      const response = await request(app)
        .get('/_next/data/vHr_mAEa3AYMgNUBTjo4-/en/security.json')
        
        .set('Accept', 'application/json');
      
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(500);
    });

    // Confidence: 0.50
    it('should GET /_next/data/vHr_mAEa3AYMgNUBTjo4-/en/buy/ada.json?slug=buy&slug=ada', async () => {
      const response = await request(app)
        .get('/_next/data/vHr_mAEa3AYMgNUBTjo4-/en/buy/ada.json?slug=buy&slug=ada')
        
        .set('Accept', 'application/json');
      
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(500);
    });

    // Confidence: 0.50
    it('should GET /_next/data/vHr_mAEa3AYMgNUBTjo4-/en/newsroom/media.json', async () => {
      const response = await request(app)
        .get('/_next/data/vHr_mAEa3AYMgNUBTjo4-/en/newsroom/media.json')
        
        .set('Accept', 'application/json');
      
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(500);
    });

    // Confidence: 0.50
    it('should GET /_next/data/vHr_mAEa3AYMgNUBTjo4-/en/sell/btc.json?slug=btc', async () => {
      const response = await request(app)
        .get('/_next/data/vHr_mAEa3AYMgNUBTjo4-/en/sell/btc.json?slug=btc')
        
        .set('Accept', 'application/json');
      
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(500);
    });

    // Confidence: 0.50
    it('should GET /_next/data/vHr_mAEa3AYMgNUBTjo4-/en/contact-us.json', async () => {
      const response = await request(app)
        .get('/_next/data/vHr_mAEa3AYMgNUBTjo4-/en/contact-us.json')
        
        .set('Accept', 'application/json');
      
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(500);
    });

    // Confidence: 0.50
    it('should GET /_next/data/vHr_mAEa3AYMgNUBTjo4-/en/buy/btc.json?slug=buy&slug=btc', async () => {
      const response = await request(app)
        .get('/_next/data/vHr_mAEa3AYMgNUBTjo4-/en/buy/btc.json?slug=buy&slug=btc')
        
        .set('Accept', 'application/json');
      
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(500);
    });

    // Confidence: 0.50
    it('should GET /_next/data/vHr_mAEa3AYMgNUBTjo4-/en/business/virtual-accounts.json', async () => {
      const response = await request(app)
        .get('/_next/data/vHr_mAEa3AYMgNUBTjo4-/en/business/virtual-accounts.json')
        
        .set('Accept', 'application/json');
      
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(500);
    });

    // Confidence: 0.50
    it('should GET /_next/data/vHr_mAEa3AYMgNUBTjo4-/en/swap/link.json?slug=link', async () => {
      const response = await request(app)
        .get('/_next/data/vHr_mAEa3AYMgNUBTjo4-/en/swap/link.json?slug=link')
        
        .set('Accept', 'application/json');
      
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(500);
    });

    // Confidence: 0.50
    it('should GET /_next/data/vHr_mAEa3AYMgNUBTjo4-/en/buy/eth.json?slug=buy&slug=eth', async () => {
      const response = await request(app)
        .get('/_next/data/vHr_mAEa3AYMgNUBTjo4-/en/buy/eth.json?slug=buy&slug=eth')
        
        .set('Accept', 'application/json');
      
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(500);
    });

    // Confidence: 0.50
    it('should GET /_next/data/vHr_mAEa3AYMgNUBTjo4-/en/swap/aave.json?slug=aave', async () => {
      const response = await request(app)
        .get('/_next/data/vHr_mAEa3AYMgNUBTjo4-/en/swap/aave.json?slug=aave')
        
        .set('Accept', 'application/json');
      
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(500);
    });

    // Confidence: 0.50
    it('should GET /_next/data/vHr_mAEa3AYMgNUBTjo4-/en/sell/xrp.json?slug=xrp', async () => {
      const response = await request(app)
        .get('/_next/data/vHr_mAEa3AYMgNUBTjo4-/en/sell/xrp.json?slug=xrp')
        
        .set('Accept', 'application/json');
      
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(500);
    });

    // Confidence: 0.50
    it('should GET /_next/data/vHr_mAEa3AYMgNUBTjo4-/en/legal.json', async () => {
      const response = await request(app)
        .get('/_next/data/vHr_mAEa3AYMgNUBTjo4-/en/legal.json')
        
        .set('Accept', 'application/json');
      
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(500);
    });

    // Confidence: 0.50
    it('should GET /_next/data/vHr_mAEa3AYMgNUBTjo4-/en/learn/cryptocurrency/what-is-crypto-staking.json?category=cryptocurrency&slug=what-is-crypto-staking', async () => {
      const response = await request(app)
        .get('/_next/data/vHr_mAEa3AYMgNUBTjo4-/en/learn/cryptocurrency/what-is-crypto-staking.json?category=cryptocurrency&slug=what-is-crypto-staking')
        
        .set('Accept', 'application/json');
      
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(500);
    });

    // Confidence: 0.50
    it('should GET /_next/data/vHr_mAEa3AYMgNUBTjo4-/en/sell/eth.json?slug=eth', async () => {
      const response = await request(app)
        .get('/_next/data/vHr_mAEa3AYMgNUBTjo4-/en/sell/eth.json?slug=eth')
        
        .set('Accept', 'application/json');
      
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(500);
    });

    // Confidence: 0.50
    it('should GET /_next/data/vHr_mAEa3AYMgNUBTjo4-/en/price/ethereum.json?slug=ethereum', async () => {
      const response = await request(app)
        .get('/_next/data/vHr_mAEa3AYMgNUBTjo4-/en/price/ethereum.json?slug=ethereum')
        
        .set('Accept', 'application/json');
      
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(500);
    });

    // Confidence: 0.50
    it('should GET /_next/data/vHr_mAEa3AYMgNUBTjo4-/en/legal/cookie_policy.json?slug=legal&slug=cookie_policy', async () => {
      const response = await request(app)
        .get('/_next/data/vHr_mAEa3AYMgNUBTjo4-/en/legal/cookie_policy.json?slug=legal&slug=cookie_policy')
        
        .set('Accept', 'application/json');
      
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(500);
    });

    // Confidence: 0.50
    it('should GET /_next/data/vHr_mAEa3AYMgNUBTjo4-/en/price/xrp.json?slug=xrp', async () => {
      const response = await request(app)
        .get('/_next/data/vHr_mAEa3AYMgNUBTjo4-/en/price/xrp.json?slug=xrp')
        
        .set('Accept', 'application/json');
      
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(500);
    });

    // Confidence: 0.50
    it('should GET /_next/data/vHr_mAEa3AYMgNUBTjo4-/en/learn/blockchain.json', async () => {
      const response = await request(app)
        .get('/_next/data/vHr_mAEa3AYMgNUBTjo4-/en/learn/blockchain.json')
        
        .set('Accept', 'application/json');
      
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(500);
    });

    // Confidence: 0.50
    it('should GET /_next/data/vHr_mAEa3AYMgNUBTjo4-/en/price/cardano.json?slug=cardano', async () => {
      const response = await request(app)
        .get('/_next/data/vHr_mAEa3AYMgNUBTjo4-/en/price/cardano.json?slug=cardano')
        
        .set('Accept', 'application/json');
      
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(500);
    });

    // Confidence: 0.50
    it('should GET /_next/data/vHr_mAEa3AYMgNUBTjo4-/en/swap/eth.json?slug=eth', async () => {
      const response = await request(app)
        .get('/_next/data/vHr_mAEa3AYMgNUBTjo4-/en/swap/eth.json?slug=eth')
        
        .set('Accept', 'application/json');
      
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(500);
    });

    // Confidence: 0.50
    it('should GET /_next/data/vHr_mAEa3AYMgNUBTjo4-/en/learn/defi.json', async () => {
      const response = await request(app)
        .get('/_next/data/vHr_mAEa3AYMgNUBTjo4-/en/learn/defi.json')
        
        .set('Accept', 'application/json');
      
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(500);
    });

    // Confidence: 0.50
    it('should GET /_next/data/vHr_mAEa3AYMgNUBTjo4-/en/legal/privacy_policy.json?slug=legal&slug=privacy_policy', async () => {
      const response = await request(app)
        .get('/_next/data/vHr_mAEa3AYMgNUBTjo4-/en/legal/privacy_policy.json?slug=legal&slug=privacy_policy')
        
        .set('Accept', 'application/json');
      
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(500);
    });

    // Confidence: 0.50
    it('should GET /_next/data/vHr_mAEa3AYMgNUBTjo4-/en/learn/bitcoin/bitcoin-mining.json?category=bitcoin&slug=bitcoin-mining', async () => {
      const response = await request(app)
        .get('/_next/data/vHr_mAEa3AYMgNUBTjo4-/en/learn/bitcoin/bitcoin-mining.json?category=bitcoin&slug=bitcoin-mining')
        
        .set('Accept', 'application/json');
      
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(500);
    });

    // Confidence: 0.50
    it('should GET /_next/data/vHr_mAEa3AYMgNUBTjo4-/en/price/bitcoin.json?slug=bitcoin', async () => {
      const response = await request(app)
        .get('/_next/data/vHr_mAEa3AYMgNUBTjo4-/en/price/bitcoin.json?slug=bitcoin')
        
        .set('Accept', 'application/json');
      
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(500);
    });

    // Confidence: 0.50
    it('should GET /_next/data/vHr_mAEa3AYMgNUBTjo4-/en/legal/licenses.json?slug=legal&slug=licenses', async () => {
      const response = await request(app)
        .get('/_next/data/vHr_mAEa3AYMgNUBTjo4-/en/legal/licenses.json?slug=legal&slug=licenses')
        
        .set('Accept', 'application/json');
      
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(500);
    });

    // Confidence: 0.50
    it('should GET /_next/data/vHr_mAEa3AYMgNUBTjo4-/en/sell/sol.json?slug=sol', async () => {
      const response = await request(app)
        .get('/_next/data/vHr_mAEa3AYMgNUBTjo4-/en/sell/sol.json?slug=sol')
        
        .set('Accept', 'application/json');
      
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(500);
    });

    // Confidence: 0.50
    it('should GET /_next/data/vHr_mAEa3AYMgNUBTjo4-/en/price/dogecoin.json?slug=dogecoin', async () => {
      const response = await request(app)
        .get('/_next/data/vHr_mAEa3AYMgNUBTjo4-/en/price/dogecoin.json?slug=dogecoin')
        
        .set('Accept', 'application/json');
      
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(500);
    });

    // Confidence: 0.50
    it('should GET /_next/data/vHr_mAEa3AYMgNUBTjo4-/en/about-us.json', async () => {
      const response = await request(app)
        .get('/_next/data/vHr_mAEa3AYMgNUBTjo4-/en/about-us.json')
        
        .set('Accept', 'application/json');
      
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(500);
    });

    // Confidence: 0.50
    it('should GET /_next/data/vHr_mAEa3AYMgNUBTjo4-/en/learn/nft.json', async () => {
      const response = await request(app)
        .get('/_next/data/vHr_mAEa3AYMgNUBTjo4-/en/learn/nft.json')
        
        .set('Accept', 'application/json');
      
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(500);
    });

    // Confidence: 0.50
    it('should GET /_next/data/vHr_mAEa3AYMgNUBTjo4-/en/newsroom/changelog.json', async () => {
      const response = await request(app)
        .get('/_next/data/vHr_mAEa3AYMgNUBTjo4-/en/newsroom/changelog.json')
        
        .set('Accept', 'application/json');
      
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(500);
    });
  });

  describe('onelink', () => {

    // Confidence: 0.50
    it('should GET /v1/onelink', async () => {
      const response = await request(app)
        .get('/v1/onelink')
        
        .set('Accept', 'application/json');
      
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(500);
    });
  });

  describe('v4', () => {

    // Confidence: 0.50
    it('should GET /v4/ip_address?apiKey=pk_live_R5Lf25uBfNZyKwccAZpzcxuL3ZdJ3Hc', async () => {
      const response = await request(app)
        .get('/v4/ip_address?apiKey=pk_live_R5Lf25uBfNZyKwccAZpzcxuL3ZdJ3Hc')
        
        .set('Accept', 'application/json');
      
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(500);
    });
  });

  describe('sdk', () => {

    // Confidence: 0.50
    it('should GET /sdk/goals/6267e9c924fb58147e65a55d', async () => {
      const response = await request(app)
        .get('/sdk/goals/6267e9c924fb58147e65a55d')
        
        .set('Accept', 'application/json');
      
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(500);
    });

    // Confidence: 0.50
    it('should GET /sdk/evalx/6267e9c924fb58147e65a55d/contexts/eyJraW5kIjoidXNlciIsImtleSI6IjdjNjcyZTExLTk4Y2YtNGE0OC05ZTA0LThmZTEyODEyOTc3MCIsImFub255bW91cyI6dHJ1ZSwiY3VzdG9tIjp7ImRldmljZUlkIjoiN2M2NzJlMTEtOThjZi00YTQ4LTllMDQtOGZlMTI4MTI5NzcwIiwic2hvdWxkQmxvY2tXZWJBY2NvdW50IjpmYWxzZSwiY291bnRyeSI6ImVuIn19?withReasons=true', async () => {
      const response = await request(app)
        .get('/sdk/evalx/6267e9c924fb58147e65a55d/contexts/eyJraW5kIjoidXNlciIsImtleSI6IjdjNjcyZTExLTk4Y2YtNGE0OC05ZTA0LThmZTEyODEyOTc3MCIsImFub255bW91cyI6dHJ1ZSwiY3VzdG9tIjp7ImRldmljZUlkIjoiN2M2NzJlMTEtOThjZi00YTQ4LTllMDQtOGZlMTI4MTI5NzcwIiwic2hvdWxkQmxvY2tXZWJBY2NvdW50IjpmYWxzZSwiY291bnRyeSI6ImVuIn19?withReasons=true')
        
        .set('Accept', 'application/json');
      
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(500);
    });

    // Confidence: 0.50
    it('should GET /sdk/evalx/6267e9c924fb58147e65a55d/contexts/eyJraW5kIjoidXNlciIsImtleSI6IjdjNjcyZTExLTk4Y2YtNGE0OC05ZTA0LThmZTEyODEyOTc3MCIsImFub255bW91cyI6dHJ1ZSwiY3VzdG9tIjp7ImRldmljZUlkIjoiN2M2NzJlMTEtOThjZi00YTQ4LTllMDQtOGZlMTI4MTI5NzcwIiwic2hvdWxkQmxvY2tXZWJBY2NvdW50IjpmYWxzZSwiY291bnRyeSI6ImtoIn19?withReasons=true', async () => {
      const response = await request(app)
        .get('/sdk/evalx/6267e9c924fb58147e65a55d/contexts/eyJraW5kIjoidXNlciIsImtleSI6IjdjNjcyZTExLTk4Y2YtNGE0OC05ZTA0LThmZTEyODEyOTc3MCIsImFub255bW91cyI6dHJ1ZSwiY3VzdG9tIjp7ImRldmljZUlkIjoiN2M2NzJlMTEtOThjZi00YTQ4LTllMDQtOGZlMTI4MTI5NzcwIiwic2hvdWxkQmxvY2tXZWJBY2NvdW50IjpmYWxzZSwiY291bnRyeSI6ImtoIn19?withReasons=true')
        
        .set('Accept', 'application/json');
      
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(500);
    });
  });

  describe('measurement', () => {

    // Confidence: 0.50
    it('should POST /measurement/conversion?random=1766546962440&cv=11&tid=G-YX57SVDKYQ&fst=1766546962440&fmt=6&en=session_start&gtm=45je5ca1v9188453715z89206556647za20gzb9206556647zd9206556647xec&gcd=13l3l3l3l1l1&dma=0&tag_exp=103116026~103200004~104527906~104528501~104684208~104684211~105391252~115583767~115616986~115706422~115938465~115938468~116184927~116184929~116251938~116251940~116744866&u_w=1920&u_h=1080&url=https%3A%2F%2Fwww.REDACTED_DOMAIN%2F&gacid=91534764.1766546962&frm=0&tiba=REDACTED%3A%20Buy%20and%20sell%20Bitcoin%2C%20Ethereum%2C%20and%20other%20cryptos&npa=0&pscdl=noapi&auid=1538567113.1766546962&uaa=x86&uab=64&uafvl=HeadlessChrome%3B143.0.7499.4%7CChromium%3B143.0.7499.4%7CNot%2520A(Brand%3B24.0.0.0&uamb=0&uam=&uap=macOS&uapv=10_15_7&uaw=0', async () => {
      const response = await request(app)
        .post('/measurement/conversion?random=1766546962440&cv=11&tid=G-YX57SVDKYQ&fst=1766546962440&fmt=6&en=session_start&gtm=45je5ca1v9188453715z89206556647za20gzb9206556647zd9206556647xec&gcd=13l3l3l3l1l1&dma=0&tag_exp=103116026~103200004~104527906~104528501~104684208~104684211~105391252~115583767~115616986~115706422~115938465~115938468~116184927~116184929~116251938~116251940~116744866&u_w=1920&u_h=1080&url=https%3A%2F%2Fwww.REDACTED_DOMAIN%2F&gacid=91534764.1766546962&frm=0&tiba=REDACTED%3A%20Buy%20and%20sell%20Bitcoin%2C%20Ethereum%2C%20and%20other%20cryptos&npa=0&pscdl=noapi&auid=1538567113.1766546962&uaa=x86&uab=64&uafvl=HeadlessChrome%3B143.0.7499.4%7CChromium%3B143.0.7499.4%7CNot%2520A(Brand%3B24.0.0.0&uamb=0&uam=&uap=macOS&uapv=10_15_7&uaw=0')
        .send({})
        .set('Accept', 'application/json');
      
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(500);
    });
  });

  describe('events?site-id=e7ffc8de-1985-4124-8ed8-9ba1e0dd16c7', () => {

    // Confidence: 0.50
    it('should POST /events?site-id=e7ffc8de-1985-4124-8ed8-9ba1e0dd16c7', async () => {
      const response = await request(app)
        .post('/events?site-id=e7ffc8de-1985-4124-8ed8-9ba1e0dd16c7')
        .send({})
        .set('Accept', 'application/json');
      
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(500);
    });
  });

  describe('g', () => {

    // Confidence: 0.50
    it('should POST /g/collect?v=2&tid=G-YX57SVDKYQ&gtm=45je5ca1v9188453715z89206556647za20gzb9206556647zd9206556647&_p=1766546959675&_gaz=1&gcd=13l3l3l3l1l1&npa=0&dma=0&cid=91534764.1766546962&ecid=1003722392&ul=en-us&sr=1920x1080&uaa=x86&uab=64&uafvl=HeadlessChrome%3B143.0.7499.4%7CChromium%3B143.0.7499.4%7CNot%2520A(Brand%3B24.0.0.0&uamb=0&uam=&uap=macOS&uapv=10_15_7&uaw=0&are=1&frm=0&pscdl=noapi&ec_mode=a&_prs=ok&_s=1&tag_exp=103116026~103200004~104527906~104528501~104684208~104684211~105391252~115583767~115616986~115706422~115938465~115938468~116184927~116184929~116251938~116251940~116744866&sid=1766546962&sct=1&seg=0&dl=https%3A%2F%2Fwww.REDACTED_DOMAIN%2F&dt=REDACTED%3A%20Buy%20and%20sell%20Bitcoin%2C%20Ethereum%2C%20and%20other%20cryptos&en=page_view&_fv=1&_nsi=1&_ss=2&tfd=3516', async () => {
      const response = await request(app)
        .post('/g/collect?v=2&tid=G-YX57SVDKYQ&gtm=45je5ca1v9188453715z89206556647za20gzb9206556647zd9206556647&_p=1766546959675&_gaz=1&gcd=13l3l3l3l1l1&npa=0&dma=0&cid=91534764.1766546962&ecid=1003722392&ul=en-us&sr=1920x1080&uaa=x86&uab=64&uafvl=HeadlessChrome%3B143.0.7499.4%7CChromium%3B143.0.7499.4%7CNot%2520A(Brand%3B24.0.0.0&uamb=0&uam=&uap=macOS&uapv=10_15_7&uaw=0&are=1&frm=0&pscdl=noapi&ec_mode=a&_prs=ok&_s=1&tag_exp=103116026~103200004~104527906~104528501~104684208~104684211~105391252~115583767~115616986~115706422~115938465~115938468~116184927~116184929~116251938~116251940~116744866&sid=1766546962&sct=1&seg=0&dl=https%3A%2F%2Fwww.REDACTED_DOMAIN%2F&dt=REDACTED%3A%20Buy%20and%20sell%20Bitcoin%2C%20Ethereum%2C%20and%20other%20cryptos&en=page_view&_fv=1&_nsi=1&_ss=2&tfd=3516')
        .send({})
        .set('Accept', 'application/json');
      
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(500);
    });

    // Confidence: 0.50
    it('should POST /g/collect?v=2&tid=G-YX57SVDKYQ&gtm=45je5ca1v9188453715z89206556647za20gzb9206556647zd9206556647&_p=1766546993113&gcd=13l3l3l3l1l1&npa=0&dma=0&cid=91534764.1766546962&ecid=1003722392&ul=en-us&sr=1920x1080&uaa=x86&uab=64&uafvl=HeadlessChrome%3B143.0.7499.4%7CChromium%3B143.0.7499.4%7CNot%2520A(Brand%3B24.0.0.0&uamb=0&uam=&uap=macOS&uapv=10_15_7&uaw=0&are=1&frm=0&pscdl=noapi&ec_mode=a&_eu=AAAAAAQ&_s=1&tag_exp=103116026~103200004~104527907~104528500~104684208~104684211~105391253~115583767~115706422~115938466~115938468~116184927~116184929~116251938~116251940~116682875&sid=1766546962&sct=1&seg=1&dl=https%3A%2F%2Fwww.REDACTED_DOMAIN%2F&dt=REDACTED%3A%20Buy%20and%20sell%20Bitcoin%2C%20Ethereum%2C%20and%20other%20cryptos&en=page_view&tfd=953', async () => {
      const response = await request(app)
        .post('/g/collect?v=2&tid=G-YX57SVDKYQ&gtm=45je5ca1v9188453715z89206556647za20gzb9206556647zd9206556647&_p=1766546993113&gcd=13l3l3l3l1l1&npa=0&dma=0&cid=91534764.1766546962&ecid=1003722392&ul=en-us&sr=1920x1080&uaa=x86&uab=64&uafvl=HeadlessChrome%3B143.0.7499.4%7CChromium%3B143.0.7499.4%7CNot%2520A(Brand%3B24.0.0.0&uamb=0&uam=&uap=macOS&uapv=10_15_7&uaw=0&are=1&frm=0&pscdl=noapi&ec_mode=a&_eu=AAAAAAQ&_s=1&tag_exp=103116026~103200004~104527907~104528500~104684208~104684211~105391253~115583767~115706422~115938466~115938468~116184927~116184929~116251938~116251940~116682875&sid=1766546962&sct=1&seg=1&dl=https%3A%2F%2Fwww.REDACTED_DOMAIN%2F&dt=REDACTED%3A%20Buy%20and%20sell%20Bitcoin%2C%20Ethereum%2C%20and%20other%20cryptos&en=page_view&tfd=953')
        .send({})
        .set('Accept', 'application/json');
      
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(500);
    });
  });

  describe('onelink?af_id=6b9788c7-4b47-4afc-b133-150e4ae3ca0e-p', () => {

    // Confidence: 0.50
    it('should GET /v1/onelink?af_id=6b9788c7-4b47-4afc-b133-150e4ae3ca0e-p', async () => {
      const response = await request(app)
        .get('/v1/onelink?af_id=6b9788c7-4b47-4afc-b133-150e4ae3ca0e-p')
        
        .set('Accept', 'application/json');
      
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(500);
    });
  });

  describe('event', () => {

    // Confidence: 0.50
    it('should POST /api/event', async () => {
      const response = await request(app)
        .post('/api/event')
        .send({})
        .set('Accept', 'application/json');
      
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(500);
    });
  });

  describe('segint', () => {

    // Confidence: 0.50
    it('should GET /segint/ej2G8fYeSR0yiKnWlfFAgsKnCePEC73S', async () => {
      const response = await request(app)
        .get('/segint/ej2G8fYeSR0yiKnWlfFAgsKnCePEC73S')
        
        .set('Accept', 'application/json');
      
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(500);
    });
  });

  describe('projects', () => {

    // Confidence: 0.50
    it('should GET /v1/projects/ej2G8fYeSR0yiKnWlfFAgsKnCePEC73S/settings', async () => {
      const response = await request(app)
        .get('/v1/projects/ej2G8fYeSR0yiKnWlfFAgsKnCePEC73S/settings')
        
        .set('Accept', 'application/json');
      
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(500);
    });
  });

  describe('segapi', () => {

    // Confidence: 0.50
    it('should POST /segapi/v1/p', async () => {
      const response = await request(app)
        .post('/segapi/v1/p')
        .send({})
        .set('Accept', 'application/json');
      
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(500);
    });
  });

  describe('events', () => {

    // Confidence: 0.50
    it('should POST /events/diagnostic/6267e9c924fb58147e65a55d', async () => {
      const response = await request(app)
        .post('/events/diagnostic/6267e9c924fb58147e65a55d')
        .send({})
        .set('Accept', 'application/json');
      
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(500);
    });

    // Confidence: 0.50
    it('should POST /events/bulk/6267e9c924fb58147e65a55d', async () => {
      const response = await request(app)
        .post('/events/bulk/6267e9c924fb58147e65a55d')
        .send({})
        .set('Accept', 'application/json');
      
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(500);
    });
  });

  describe('business', () => {

    // Confidence: 0.50
    it('should GET /business/ramps?slug=onramps', async () => {
      const response = await request(app)
        .get('/business/ramps?slug=onramps')
        
        .set('Accept', 'application/json');
      
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(500);
    });

    // Confidence: 0.50
    it('should GET /business/ramps?slug=offramps', async () => {
      const response = await request(app)
        .get('/business/ramps?slug=offramps')
        
        .set('Accept', 'application/json');
      
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(500);
    });
  });

});