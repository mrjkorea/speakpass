const TESTS = [
  "test01", "test02", "test03", "test04", "test05",
  "test06", "test07", "test08", "test09", "test10"
];

/** One-time Play product ids. Each id unlocks the listed tests for good. */
export const PRODUCTS = {
  speakpass_test01: ["test01"],
  speakpass_test02: ["test02"],
  speakpass_test03: ["test03"],
  speakpass_test04: ["test04"],
  speakpass_test05: ["test05"],
  speakpass_test06: ["test06"],
  speakpass_test07: ["test07"],
  speakpass_test08: ["test08"],
  speakpass_test09: ["test09"],
  speakpass_test10: ["test10"],
  speakpass_tests_01_10: TESTS
};

export function testsForProduct(productId) {
  const list = PRODUCTS[String(productId || "")];
  return list ? list.slice() : null;
}

export function productCovers(productId, testId) {
  const list = testsForProduct(productId);
  return !!list && list.includes(String(testId || ""));
}
