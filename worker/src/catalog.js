import test01 from "../../tests/test01.json" with { type: "json" };
import test02 from "../../tests/test02.json" with { type: "json" };
import test03 from "../../tests/test03.json" with { type: "json" };
import test04 from "../../tests/test04.json" with { type: "json" };
import test05 from "../../tests/test05.json" with { type: "json" };
import test06 from "../../tests/test06.json" with { type: "json" };
import test07 from "../../tests/test07.json" with { type: "json" };
import test08 from "../../tests/test08.json" with { type: "json" };
import test09 from "../../tests/test09.json" with { type: "json" };
import test10 from "../../tests/test10.json" with { type: "json" };

const ALL = [test01, test02, test03, test04, test05, test06, test07, test08, test09, test10];

export const TESTS = Object.fromEntries(ALL.map((test) => [test.id, test]));

export function getTest(id) {
  return TESTS[String(id || "")] || null;
}
