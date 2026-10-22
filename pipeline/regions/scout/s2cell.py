"""S2 cell token at level 4 for a lon/lat. Google Open Buildings v3 ships one file per level-4 S2 cell.
Written from the S2 geometry spec (cube face, quadratic st->uv, Hilbert curve). Checked once against s2sphere."""
import math

LOOKUP_BITS = 4
SWAP, INVERT = 1, 2
POS_TO_IJ = [[0, 1, 3, 2], [0, 2, 3, 1], [3, 2, 0, 1], [3, 1, 0, 2]]
POS_TO_ORIENT = [SWAP, 0, 0, INVERT | SWAP]
LOOKUP_POS, LOOKUP_IJ = {}, {}


def _init(level, i, j, orig, pos, orient):
    if level == LOOKUP_BITS:
        ij = (i << LOOKUP_BITS) + j
        LOOKUP_POS[(ij << 2) + orig] = (pos << 2) + orient
        LOOKUP_IJ[(pos << 2) + orient] = (ij << 2) + orig
        return
    level += 1
    i <<= 1
    j <<= 1
    pos <<= 2
    for sub in range(4):
        ij = POS_TO_IJ[orient][sub]
        _init(level, i + (ij >> 1), j + (ij & 1), orig, pos + sub, orient ^ POS_TO_ORIENT[sub])


for _o in range(4):
    _init(0, 0, 0, _o, 0, _o)


def _face_uv(x, y, z):
    ax = [abs(x), abs(y), abs(z)]
    f = ax.index(max(ax))
    c = (x, y, z)[f]
    face = f + (3 if c < 0 else 0)
    u, v = {0: (y / x, z / x), 1: (-x / y, z / y), 2: (-x / z, -y / z),
            3: (z / x, y / x), 4: (z / y, -x / y), 5: (-y / z, -x / z)}[face]
    return face, u, v


def _uv_to_st(u):
    return 0.5 * math.sqrt(1 + 3 * u) if u >= 0 else 1 - 0.5 * math.sqrt(1 - 3 * u)


def cell_id(lon, lat):
    phi, theta = math.radians(lat), math.radians(lon)
    x, y, z = math.cos(phi) * math.cos(theta), math.cos(phi) * math.sin(theta), math.sin(phi)
    face, u, v = _face_uv(x, y, z)
    n = 1 << 30
    i = min(n - 1, max(0, int(math.floor(n * _uv_to_st(u)))))
    j = min(n - 1, max(0, int(math.floor(n * _uv_to_st(v)))))
    bits = face & SWAP
    cid = 0
    for k in range(7, -1, -1):
        mask = (1 << LOOKUP_BITS) - 1
        bits += ((i >> (k * LOOKUP_BITS)) & mask) << (LOOKUP_BITS + 2)
        bits += ((j >> (k * LOOKUP_BITS)) & mask) << 2
        bits = LOOKUP_POS[bits]
        cid |= (bits >> 2) << (k * 2 * LOOKUP_BITS)
        bits &= SWAP | INVERT
    return (face << 61) + (cid << 1) + 1


def token_level4(lon, lat):
    cid = cell_id(lon, lat)
    lsb = 1 << (2 * (30 - 4))
    parent = (cid & -lsb) | lsb
    return f"{parent:016x}".rstrip("0")
