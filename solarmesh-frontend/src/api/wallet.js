import apiClient from './client';

export const walletApi = {
  getWallet: async () => {
    const response = await apiClient.get('/api/wallet');
    return response.data; // { id, user_id, balance, reserved, available, energy_kwh_sold, energy_kwh_bought }
  },

  getLedger: async (limit = 50, offset = 0) => {
    const response = await apiClient.get('/api/wallet/ledger', {
      params: { limit, offset },
    });
    return response.data; // array of LedgerEntryOut
  },

  depositSelf: async (amount) => {
    const response = await apiClient.post('/api/wallet/deposit/self', {
      amount: Number(amount),
    });
    return response.data; // updated wallet
  },

  depositAdmin: async (amount, targetUserId) => {
    const response = await apiClient.post('/api/wallet/deposit', {
      amount: Number(amount),
    }, {
      params: targetUserId ? { user_id: targetUserId } : {},
    });
    return response.data;
  },

  transferFunds: async (recipientEmail, amount, memo = '') => {
    const response = await apiClient.post('/api/wallet/transfer', {
      recipient_email: recipientEmail,
      amount: Number(amount),
      memo: memo || undefined,
    });
    return response.data;
  },
};
