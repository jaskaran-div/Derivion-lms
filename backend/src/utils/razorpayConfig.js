const getCheckoutConfigurationId = (emiEnabled, env = process.env) => {
  const configurationId = emiEnabled === true
    ? env.RAZORPAY_CONFIG_EMI
    : env.RAZORPAY_CONFIG_STANDARD
  return typeof configurationId === 'string' ? configurationId.trim() || null : null;
};

module.exports = { getCheckoutConfigurationId };
