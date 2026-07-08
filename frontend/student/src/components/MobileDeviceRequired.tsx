import React from 'react';

const MobileDeviceRequired = () => {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6 text-center">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full border border-gray-100 flex flex-col items-center">
        <div className="bg-red-50 p-4 rounded-full mb-6 text-4xl">
          📱
        </div>
        
        <h1 className="text-2xl font-bold text-gray-900 mb-4 tracking-tight">
          Mobile Device Required
        </h1>
        
        <p className="text-gray-600 mb-6 leading-relaxed">
          For security and location verification, attendance can only be marked using a smartphone or tablet with a touchscreen.
        </p>

        <div className="bg-gray-50 p-4 rounded-xl w-full text-sm text-gray-500 border border-gray-100">
          <p>Please open this link or scan the QR code using your mobile device's camera.</p>
        </div>
      </div>
    </div>
  );
};

export default MobileDeviceRequired;
