"""Project decisions of 2026-10-22, applied on top of the research access policy without editing it.

1. A barrier=kerb node does not trigger the access check. A raised kerb becomes a step (bit 16) elsewhere.
2. Only access:conditional, foot:conditional and opening_hours restrict walkers. Other :conditional keys
   restrict vehicles only (oneway, motor_vehicle, maxspeed, parking and so on), so the check ignores them.
3. An indoor, corridor or building-passage edge with a cited hours.json row is routable while open.
   build_graph.py applies this rule after it assigns hours.
4. A barrier=bollard or barrier=height_restrictor node does not trigger the access check (2026-10-22).
   Both stop vehicles and let walkers through. An access, foot or entrance tag on the node still applies.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common  # noqa: E402, F401  adds the research scripts to sys.path
from pedestrian_access import PROFILE, requires_access_evaluation  # noqa: E402

LOCAL_PROFILE = PROFILE + " + lead-2026-10-22"
WALKER_CONDITIONALS = {"access:conditional", "foot:conditional"}


def walker_tags(tags):
    """Tags with vehicle-only :conditional keys removed."""
    return {k: v for k, v in tags.items() if not k.endswith(":conditional") or k in WALKER_CONDITIONALS}


def ignored_conditionals(tags):
    return sorted(k for k in tags if k.endswith(":conditional") and k not in WALKER_CONDITIONALS)


def way_requires_evaluation(tags):
    return requires_access_evaluation(walker_tags(tags))


# Barriers that stop vehicles and let walkers through.
WALKER_PASSES = {"kerb", "bollard", "height_restrictor"}


def node_walker_tags(tags):
    t = walker_tags(tags)
    if t.get("barrier") in WALKER_PASSES:
        del t["barrier"]
    return t


def node_requires_evaluation(tags):
    return requires_access_evaluation(node_walker_tags(tags))
