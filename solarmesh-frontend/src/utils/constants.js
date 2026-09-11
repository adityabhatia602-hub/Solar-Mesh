// Application constants and configuration

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
export const WS_BASE_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8000/ws/live';

export const USER_ROLES = {
  PROSUMER: 'prosumer',
  CONSUMER: 'consumer',
  ADMIN: 'admin',
};

export const ORDER_SIDES = {
  OFFER: 'offer', // Sell solar energy
  BID: 'bid',     // Buy energy
};

export const ORDER_STATUS = {
  OPEN: 'open',
  FILLED: 'filled',
  PARTIALLY_FILLED: 'partially_filled',
  CANCELLED: 'cancelled',
  EXPIRED: 'expired',
};

export const TRADE_STATUS = {
  PENDING: 'pending',
  MATCHED: 'matched',
  SETTLED: 'settled',
  FAILED: 'failed',
};

export const DEVICE_TYPES = {
  SOLAR_PANEL: 'solar_panel',
  BATTERY: 'battery',
  METER: 'meter',
};

// Sustainability & economic constants
export const CO2_KG_PER_KWH = 0.82; // average coal/gas grid offset in kg CO2 per clean kWh
export const UTILITY_GRID_TARIFF = 0.28; // standard grid retail price $/kWh reference

// Mock blockchain parameters for the P2P settlement verification view
export const BLOCKCHAIN_CONFIG = {
  NETWORK_NAME: 'SolarMesh Private Besu Rollup',
  CHAIN_ID: '42161',
  SETTLEMENT_CONTRACT: '0x3c78aB2945d1d61Ef56B5C3D287d1911D44f1284',
  ESCROW_CONTRACT: '0x892a05A3A3b2A88E4d521d89B2B61A97Ec1b6B7C',
  CONSENSUS: 'IBFT 2.0 Proof of Authority (Instant Finality)',
  BLOCK_TIME_SEC: 2.0,
};
