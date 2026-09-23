import React from 'react';

interface Props {
  total: number;
  used: number;
}

export const CreditUtilizationBar: React.FC<Props> = ({ total, used }) => {
  const percentage = Math.min((used / total) * 100, 100);
  
  // Choose color based on utilization
  let bgColor = 'bg-fintech-success';
  if (percentage > 80) bgColor = 'bg-fintech-danger';
  else if (percentage > 50) bgColor = 'bg-fintech-warning';

  return (
    <div className="w-full">
      <div className="flex justify-between text-sm mb-1 text-fintech-secondary">
        <span>Utilized: ₹{used.toLocaleString()}</span>
        <span>Available: ₹{(total - used).toLocaleString()}</span>
      </div>
      <div className="h-3 w-full bg-gray-200 rounded-full overflow-hidden">
        <div 
          className={`h-full ${bgColor} transition-all duration-500 ease-out`} 
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
};
