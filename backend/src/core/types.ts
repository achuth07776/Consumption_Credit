export enum TransactionStatus {
  INITIATED = 'INITIATED',
  PENDING_CONSENT = 'PENDING_CONSENT',
  HIGH_RISK = 'HIGH_RISK',
  DECLINED = 'DECLINED',
  PENDING_SETTLEMENT = 'PENDING_SETTLEMENT',
  SETTLED = 'SETTLED'
}

export enum ConsentStatus {
  GRANTED = 'GRANTED',
  REVOKED = 'REVOKED',
  PENDING = 'PENDING'
}

export type RiskScore = {
  score: number; // 0 to 100
  isAcceptable: boolean;
  reason?: string;
};
