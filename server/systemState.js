// Global Nitro Platform System State
let aiEnabled = true;

module.exports = {
  isAiEnabled: () => aiEnabled,
  setAiEnabled: (state) => {
    aiEnabled = !!state;
    return aiEnabled;
  }
};
