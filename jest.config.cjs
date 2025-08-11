module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testTimeout: 10000, // 非同期処理が多いためタイムアウトを延長
  roots: ["<rootDir>/src"],
};
