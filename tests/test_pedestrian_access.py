"""Exercise research filters and their actual OSM output, without network access."""
import ast
import importlib.util
import json
from pathlib import Path
import pickle
import re
import subprocess
import sys
import tempfile
import unittest

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "research/20261021T120813Z/scripts"
EXTRACTORS = [SCRIPTS / p for p in (
    "01/extract_ped.py", "03/extract_ncr.py", "05/extract_walk_graph.py")]


def load_filter(path):
    # Original scripts run their CLI at import time. Read only the filter definitions.
    tree = ast.parse(path.read_text())
    definitions = [n for n in tree.body if (
        isinstance(n, ast.Assign) and any(isinstance(t, ast.Name) and
        t.id.startswith("EXCL") for t in n.targets)) or (
        isinstance(n, ast.FunctionDef) and n.name == "walkable")]
    scope = {"re": re}
    policy_path = SCRIPTS / "pedestrian_access.py"
    if policy_path.exists():
        spec = importlib.util.spec_from_file_location("pedestrian_access", policy_path)
        policy = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(policy)
        scope["static_public_walkable"] = policy.static_public_walkable
    exec(compile(ast.Module(body=definitions, type_ignores=[]), str(path), "exec"), scope)
    return scope["walkable"]


class AccessRules(unittest.TestCase):
    def policy(self):
        spec = importlib.util.spec_from_file_location("pedestrian_access", SCRIPTS / "pedestrian_access.py")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module

    def test_node_restriction_and_specific_pedestrian_permission(self):
        policy = self.policy()
        self.assertTrue(policy.node_blocks_public({"barrier": "gate", "access": "no"}))
        self.assertFalse(policy.node_blocks_public({"barrier": "gate", "access": "private", "foot": "yes"}))
        self.assertTrue(policy.node_blocks_public({"barrier": "gate", "locked": "yes", "foot": "yes"}))

    def test_unknown_gate_and_conditional_permission_need_evaluation(self):
        policy = self.policy()
        self.assertTrue(policy.requires_access_evaluation({"barrier": "gate"}))
        self.assertTrue(policy.requires_access_evaluation({"highway": "corridor"}))
        self.assertTrue(policy.requires_access_evaluation({"indoor": "yes"}))
        self.assertTrue(policy.requires_access_evaluation({"tunnel": "building_passage"}))
        tags = {"highway": "footway", "access": "private", "foot:conditional": "yes @ (06:00-22:00)"}
        self.assertFalse(policy.static_public_walkable(tags))
        self.assertEqual(policy.rule_tags(tags)["foot:conditional"], tags["foot:conditional"])

    def test_static_public_access_and_pedestrian_overrides(self):
        cases = [
            ({}, True),
            ({"access": "private"}, False),
            ({"access": "no"}, False),
            ({"foot": "private"}, False),
            ({"foot": "no", "access": "yes"}, False),
            ({"access": "customers"}, False),
            ({"access": "destination"}, False),
            ({"foot": "destination"}, False),
            ({"foot": "permit"}, False),
            ({"access": "private", "foot": "yes"}, True),
            ({"access": "no", "foot": "designated"}, True),
            ({"access": "private", "foot": "permissive"}, True),
            ({"access": "permissive"}, True),
            ({"service": "private"}, False),
            ({"service": "private", "foot": "yes"}, True),
            ({"foot": "use_sidepath"}, False),
            ({"access": "unknown_value"}, False),
            ({"area": "yes"}, False),
            ({"highway": "construction"}, False),
            ({"highway": "busway"}, False),
            ({"highway": "secondary", "tunnel": "yes"}, False),
            ({"highway": "secondary", "tunnel": "yes", "foot": "yes"}, True),
        ]
        for path in EXTRACTORS:
            walkable = load_filter(path)
            for tags, expected in cases:
                with self.subTest(extractor=path.parent.name, tags=tags):
                    self.assertEqual(walkable({"highway": "footway", **tags}), expected)

    def test_shelter_flags_exclude_vehicle_cover(self):
        spec = importlib.util.spec_from_file_location("extract_walk_graph", SCRIPTS / "05/extract_walk_graph.py")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        for highway in ("secondary", "service", "busway"):
            with self.subTest(highway=highway):
                self.assertNotIn("covered_or_tunnel", module.classify({"highway": highway, "covered": "yes", "tunnel": "yes"}))
                self.assertNotIn("indoor_or_corridor", module.classify({"highway": highway, "indoor": "yes"}))
        for tags in ({"highway": "footway", "tunnel": "yes"},
                     {"highway": "footway", "covered": "roof"}):
            self.assertIn("covered_or_tunnel", module.classify(tags))


class ExtractedOutput(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.out = Path(cls.tmp.name)
        # All nodes sit inside the Makati box. Way 40 crosses an explicitly closed gate.
        nodes = ''.join(f'<node id="{i}" lat="{14.563 if i == 8 else 14.55}" lon="{121.02+i*.00001}"'
                        ' version="1" timestamp="2026-10-20T00:00:00Z">' +
                        ('<tag k="barrier" v="gate"/><tag k="access" v="no"/>' if i == 4 else '') +
                        ('<tag k="barrier" v="gate"/><tag k="opening_hours" v="08:00-20:00"/>' if i == 8 else '') +
                        '</node>' for i in range(1, 10))
        def way(wid, refs, tags):
            return (f'<way id="{wid}" version="1" timestamp="2026-10-20T00:00:00Z">' +
                    ''.join(f'<nd ref="{n}"/>' for n in refs) +
                    '<tag k="highway" v="footway"/>' +
                    ''.join(f'<tag k="{k}" v="{v}"/>' for k, v in tags.items()) + '</way>')
        cls.rule_tags = {"access": "private", "foot": "yes",
                         "foot:conditional": "no @ (22:00-06:00)",
                         "opening_hours": "06:00-22:00"}
        ways = (way(10, [1, 2], {"access": "private"}) +
                way(20, [2, 3], cls.rule_tags) +
                way(30, [3, 5], {"foot": "private", "covered": "yes"}) +
                way(40, [5, 4, 6], {}) + way(50, [6, 7], {"foot": "yes"}) +
                way(60, [7, 8, 9], {}))
        cls.osm = cls.out / "fixture.osm"
        cls.osm.write_text('<osm version="0.6">' + nodes + ways + '</osm>')
        cls.poly = cls.out / "ncr.json"
        cls.poly.write_text(json.dumps([{"geojson": {"type": "Polygon", "coordinates":
            [[[121, 14.5], [121.04, 14.5], [121.04, 14.57], [121, 14.57], [121, 14.5]]]}}]))

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def run_cli(self, relative, *args):
        subprocess.run([sys.executable, "-I", str(SCRIPTS / relative), *map(str, args)],
                       check=True, capture_output=True, text=True)

    def test_pilot_cache_keeps_rules_and_blocks_restricted_paths(self):
        path = self.out / "cache.pkl"
        self.run_cli("01/extract_ped.py", self.osm, path)
        cache = pickle.loads(path.read_bytes())
        ways = {r[0]: r for r in cache["ways"]}
        self.assertEqual(set(ways), {20, 50, 60})
        for key, value in self.rule_tags.items():
            self.assertEqual(ways[20][2].get(key), value)
        nodes = {r[0]: r[3] for r in cache["nodes"]}
        self.assertEqual(nodes[4]["barrier"], "gate")
        self.assertEqual(nodes[4]["access"], "no")

    def test_graph_links_edges_to_retained_rules(self):
        self.run_cli("05/extract_walk_graph.py", self.osm, self.poly, self.out)
        graph = np.load(self.out / "graph_makati_cbd.npz")
        self.assertEqual(set(map(int, graph["way_id"])), {20, 50, 60})
        rules = json.loads((self.out / "graph_makati_cbd_rules.json").read_text())
        self.assertEqual(rules["ways"]["20"], self.rule_tags)
        self.assertEqual(rules["nodes"]["4"]["access"], "no")
        self.assertFalse(rules["routing_ready"])
        self.assertTrue(all(graph["requires_access_evaluation"][graph["way_id"] == 20]))

    def test_rule_nodes_survive_centroid_boundary(self):
        self.run_cli("05/extract_walk_graph.py", self.osm, self.poly, self.out)
        graph = np.load(self.out / "graph_makati_cbd.npz")
        rules = json.loads((self.out / "graph_makati_cbd_rules.json").read_text())
        self.assertEqual(rules["nodes"]["8"]["opening_hours"], "08:00-20:00")
        self.assertTrue(all(graph["requires_access_evaluation"][graph["way_id"] == 60]))

    def test_shelter_inventory_marks_restricted_way_nonwalkable(self):
        self.run_cli("03/extract_ncr.py", self.osm, self.out)
        ways = {r["id"]: r for r in map(json.loads, (self.out / "ncr_ways.jsonl").read_text().splitlines())}
        self.assertTrue(ways[20]["walk"])
        self.assertFalse(ways[30]["walk"])
        self.assertNotIn(40, {wid for wid, r in ways.items() if r["walk"]})
        self.assertEqual(ways[20]["tags"]["foot:conditional"], self.rule_tags["foot:conditional"])

    def test_map_export_matches_candidate_graph(self):
        path = self.out / "walk.geojsonseq"
        self.run_cli("05/export_walk_geojson.py", self.osm, self.poly, "makati_cbd", path)
        rows = [json.loads(line) for line in path.read_text().splitlines()]
        self.assertEqual({r["id"] for r in rows}, {20, 50, 60})
        timed = next(r for r in rows if r["id"] == 20)
        self.assertTrue(timed["properties"]["requires_access_evaluation"])


if __name__ == "__main__":
    unittest.main()
