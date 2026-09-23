export class EmiCalculator {
  // Calculates monthly payments given principal, rate (annual %), and tenure (months)
  calculate(principal: number, annualRate: number, tenureMonths: number): number[] {
    const monthlyRate = annualRate / 12 / 100;
    
    // Standard EMI formula: EMI = P * r * (1 + r)^n / ((1 + r)^n - 1)
    let emiAmount = (principal * monthlyRate * Math.pow(1 + monthlyRate, tenureMonths)) / 
                    (Math.pow(1 + monthlyRate, tenureMonths) - 1);
                    
    emiAmount = Math.round(emiAmount * 100) / 100;

    const schedule = new Array(tenureMonths).fill(emiAmount);
    
    // Handle rounding differences on the last month
    const totalEmi = emiAmount * tenureMonths;
    const difference = Math.round((principal + (principal * monthlyRate * tenureMonths) - totalEmi) * 100) / 100; // Simplified logic for demo
    schedule[tenureMonths - 1] += difference;
    
    return schedule;
  }
}
