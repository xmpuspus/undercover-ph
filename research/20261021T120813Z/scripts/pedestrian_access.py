"""Conservative static public-through access for research graph candidates.

This profile does not evaluate schedules, directional rules, local defaults or
field conditions. Retained candidates still need those checks before navigation.
"""
import re

PROFILE = "public-through-static-v1"
EXCLUDED_HIGHWAY = re.compile(
    r"abandoned|bus_guideway|busway|construction|cycleway|motor|no|planned|platform|proposed|raceway|razed"
)
PUBLIC = {"yes", "designated", "permissive", "official"}
PEDESTRIAN = {"footway", "path", "pedestrian", "steps", "corridor"}
RULE_KEYS = {
    "access", "foot", "service", "barrier", "entrance", "locked",
    "opening_hours", "oneway:foot", "foot:forward", "foot:backward",
    "wheelchair", "level", "layer", "indoor", "tunnel",
}


def rule_tags(tags):
    return {k: v for k, v in tags.items() if k in RULE_KEYS or
            k.endswith(":conditional") or k.startswith("opening_hours:")}


def public_access(tags):
    # The pedestrian-specific value takes precedence over general vehicle access.
    if "foot" in tags:
        return tags["foot"].strip().lower() in PUBLIC
    if "access" in tags:
        return tags["access"].strip().lower() in PUBLIC
    return tags.get("service") != "private"


def static_public_walkable(tags):
    hw = tags.get("highway")
    # Vehicle tunnels need explicit pedestrian permission, not an absent foot tag.
    if hw not in PEDESTRIAN and tags.get("tunnel") not in (None, "no"):
        if tags.get("foot", "").strip().lower() not in PUBLIC:
            return False
    return bool(hw and tags.get("area") != "yes" and
                not EXCLUDED_HIGHWAY.search(hw) and public_access(tags))


def node_blocks_public(tags):
    if not public_access(tags) or tags.get("locked") == "yes":
        return True
    return tags.get("barrier") in {"wall", "fence", "block", "jersey_barrier"} and \
        tags.get("foot", "").strip().lower() not in PUBLIC


def requires_access_evaluation(tags):
    controlled_passage = (tags.get("indoor") in {"yes", "corridor"} or
                          tags.get("highway") == "corridor" or
                          tags.get("tunnel") == "building_passage")
    return controlled_passage or any(k == "opening_hours" or k.startswith("opening_hours:") or
               k.endswith(":conditional") or k in
               {"barrier", "entrance", "locked", "oneway:foot", "foot:forward", "foot:backward"}
               for k in tags)


def read_node_rules(pbf):
    """Keep node rules before processing ways, including gates inside way geometry."""
    import osmium
    nodes = {}
    # Read tagged nodes without a key filter so uncommon conditional keys survive.
    for node in osmium.FileProcessor(pbf, osmium.osm.NODE):
        if not node.tags or not node.location.valid():
            continue
        tags = rule_tags(dict(node.tags))
        if tags:
            nodes[node.id] = (node.location.lat, node.location.lon, tags)
    return nodes
