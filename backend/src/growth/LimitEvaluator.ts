import { User } from '../core/models';

export interface LimitEvaluator {
  isEligibleForIncrease(user: User): boolean;
}
