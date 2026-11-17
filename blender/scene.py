"""Portal hero loop: coins roll down a tiled track, drop into a neon portal, come out as neon rings.
Headless:
  D:/blender.exe -b -P scene.py -- preview <frame> <out.png> [res_pct]
  D:/blender.exe -b -P scene.py -- render <out_dir/> [samples]
  D:/blender.exe -b -P scene.py -- save <file.blend>
Loop = LOOP frames at 30 fps, seamless (coins evenly spaced, logos repeat every 3 coins).
"""
import bpy, bmesh, math, sys
from mathutils import Vector, Matrix, Quaternion

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else ["save", "//portal.blend"]
MODE = argv[0]

# ---------------- knobs ----------------
FPS = 30
PERIOD = 50            # frames between two coins passing the same point
LOOP = PERIOD * 3      # 150 frames = 5 s
R = 1.0                # coin radius
THICK = 0.2            # coin thickness
SPACING = 3.7          # distance between coins along the path
SPEED = SPACING / PERIOD
TRACK_W = 5.0
CAM_POS = (0.0, -24.4, 8.9)
PORTAL_R = 1.95
BANK_UP, BANK_LOW = 0.4, 0.15
SIDE_SMOOTH = 900  # passes of facing-direction smoothing (spreads any turn over ~3 units of travel)
LOGOS = [("ETH", None, 0.88), ("\u20BF", "C:/Windows/Fonts/seguibl.ttf", 1.75), ("$", "C:/Windows/Fonts/seguibl.ttf", 1.75)]  # (glyph, font, size): Ethereum, Bitcoin, Dollar
PURPLE = (0.62, 0.12, 1.0)
MAGENTA = (1.0, 0.18, 0.95)

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.fps = FPS
sc.frame_start, sc.frame_end = 0, LOOP - 1

# ---------------- path helpers ----------------
def catmull(pts, n=24):
    pts = [Vector(p) for p in pts]
    P = [pts[0] * 2 - pts[1]] + pts + [pts[-1] * 2 - pts[-2]]
    out = []
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
        for k in range(n):
            t = k / n; t2, t3 = t * t, t * t * t
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
    out.append(P[-2].copy())
    return out

class Path:
    def __init__(self, pts):
        self.p = pts
        self.s = [0.0]
        for a, b in zip(pts, pts[1:]): self.s.append(self.s[-1] + (b - a).length)
        self.L = self.s[-1]
        self.side = []
        prev = None
        for i in range(len(pts)):
            a, b = pts[max(0, i - 1)], pts[min(len(pts) - 1, i + 1)]
            t = (b - a).normalized(); sd = t.cross(Z)
            sd = sd.normalized() if sd.length > 0.35 or prev is None else prev
            self.side.append(sd); prev = sd
        # smooth the facing direction along the path so the coin/ring never twists suddenly
        # (e.g. falling through the portal and landing on the lower track)
        for _ in range(SIDE_SMOOTH):
            self.side = [self.side[0]] + [(self.side[i - 1] + self.side[i] * 2 + self.side[i + 1]).normalized() for i in range(1, len(self.side) - 1)] + [self.side[-1]]
    def side_at(self, d):
        d = max(0.0, min(self.L, d))
        lo, hi = 0, len(self.s) - 1
        while hi - lo > 1:
            m = (lo + hi) // 2
            if self.s[m] <= d: lo = m
            else: hi = m
        return self.side[lo]
    def at(self, d):
        d = max(0.0, min(self.L, d))
        lo, hi = 0, len(self.s) - 1
        while hi - lo > 1:
            m = (lo + hi) // 2
            if self.s[m] <= d: lo = m
            else: hi = m
        seg = self.s[hi] - self.s[lo] or 1e-9
        t = (d - self.s[lo]) / seg
        pos = self.p[lo].lerp(self.p[hi], t)
        tan = (self.p[hi] - self.p[lo]).normalized()
        return pos, tan

Z = Vector((0, 0, 1))

def banked(pos, tan, side, bank):
    """Tilt the running surface toward the camera so the tiles read like the reference (a banked slide)."""
    up = side.cross(tan).normalized()
    if bank <= 0: return side, up
    vc = Vector(CAM_POS).normalized()          # fixed direction toward the camera (stable, no twisting)
    vp = vc - tan * vc.dot(tan)
    w = min(1.0, vp.length * 2.0)
    if vp.length < 1e-4: return side, up
    upb = (up + vp.normalized() * bank * w).normalized()
    return tan.cross(upb).normalized(), upb

# ONE continuous coin-centre path, un-projected from the coin positions in the reference video:
# rolls down the upper track, leaves its end and arcs smoothly down through the portal centre,
# keeps going (as a ring below the portal plane) onto the lower track. Coin and ring are the same motion,
# so a coin entering and a ring leaving always happen at the same moment.
CTRL = [(-5.3, 9.0, 7.6), (-4.6, 6.4, 5.9), (-3.6, 4.2, 4.6), (-2.4, 2.6, 3.6), (-1.25, 1.45, 2.85), (-0.45, 0.7, 2.25),
        (-0.04, 0.3, 1.6), (0.08, 0.12, 0.94), (0.04, 0.0, 0.02), (0.33, -0.35, -1.27), (0.76, -1.5, -2.33), (1.64, -2.8, -2.81),
        (2.45, -4.0, -3.24), (3.43, -5.8, -3.62), (4.29, -8.0, -3.95), (5.0, -10.5, -4.25), (5.6, -13.5, -4.55)]
PATH = Path(catmull(CTRL))
def dist_to(pt):  # arc length of the path sample nearest to a control point
    pt = Vector(pt); i = min(range(len(PATH.p)), key=lambda k: (PATH.p[k] - pt).length); return PATH.s[i]
UPPER_TRACK_END = dist_to(CTRL[5]) + 0.75   # ends at the back rim of the portal: the coin rolls straight in     # coin rolls off this lip, above-left of the portal
LOWER_TRACK_START = dist_to(CTRL[10]) - 0.9    # ring lands here, just under the portal
UPPER = LOWER = PATH

# ---------------- materials ----------------
def node_mat(name):
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree
    return m, nt, next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"), next(n for n in nt.nodes if n.type == "OUTPUT_MATERIAL")

def clip_by_z(m, keep_above=True, z=0.0):
    """Make the surface transparent on one side of the portal plane."""
    nt = m.node_tree; out = next(n for n in nt.nodes if n.type == "OUTPUT_MATERIAL")
    src = out.inputs["Surface"].links[0].from_socket
    geo = nt.nodes.new("ShaderNodeNewGeometry"); sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    cmp = nt.nodes.new("ShaderNodeMath"); cmp.operation = "LESS_THAN" if keep_above else "GREATER_THAN"; cmp.inputs[1].default_value = z
    tr = nt.nodes.new("ShaderNodeBsdfTransparent"); mix = nt.nodes.new("ShaderNodeMixShader")
    nt.links.new(geo.outputs["Position"], sep.inputs[0]); nt.links.new(sep.outputs["Z"], cmp.inputs[0])
    nt.links.new(cmp.outputs[0], mix.inputs[0]); nt.links.new(src, mix.inputs[1]); nt.links.new(tr.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], out.inputs["Surface"])

def coin_body_mat():
    m, nt, b, _ = node_mat("coin_body")
    b.inputs["Base Color"].default_value = (0.012, 0.012, 0.016, 1); b.inputs["Metallic"].default_value = 1.0
    b.inputs["Roughness"].default_value = 0.12
    clip_by_z(m, True, 0.02); return m

def coin_logo_mat():
    m, nt, b, _ = node_mat("coin_logo")
    b.inputs["Base Color"].default_value = (0.95, 0.95, 1.0, 1); b.inputs["Metallic"].default_value = 1.0
    b.inputs["Roughness"].default_value = 0.1
    b.inputs["Emission Color"].default_value = (1, 1, 1, 1); b.inputs["Emission Strength"].default_value = 0.35
    clip_by_z(m, True, 0.02); return m

def ring_mats():
    m, nt, b, _ = node_mat("ring_body")
    b.inputs["Base Color"].default_value = (0.03, 0.025, 0.04, 1); b.inputs["Metallic"].default_value = 1.0; b.inputs["Roughness"].default_value = 0.25
    clip_by_z(m, False, -0.05)
    n, nt2, b2, _ = node_mat("ring_neon")
    b2.inputs["Base Color"].default_value = (*MAGENTA, 1); b2.inputs["Emission Color"].default_value = (*MAGENTA, 1); b2.inputs["Emission Strength"].default_value = 9
    clip_by_z(n, False, -0.05)
    return m, n

def track_mat():
    m, nt, b, out = node_mat("track")
    uv = nt.nodes.new("ShaderNodeTexCoord"); mp = nt.nodes.new("ShaderNodeMapping"); mp.inputs["Scale"].default_value = (1.0, 1.0, 1.0)
    br = nt.nodes.new("ShaderNodeTexBrick")
    br.inputs["Color1"].default_value = (0.034, 0.032, 0.042, 1); br.inputs["Color2"].default_value = (0.008, 0.008, 0.011, 1)
    br.inputs["Bias"].default_value = 0.35
    br.inputs["Mortar"].default_value = (0.003, 0.003, 0.004, 1)
    br.inputs["Scale"].default_value = 1.0; br.inputs["Mortar Size"].default_value = 0.012
    br.inputs["Brick Width"].default_value = 0.42; br.inputs["Row Height"].default_value = 0.22
    br.offset = 0.5; br.squash = 1.0
    nt.links.new(uv.outputs["UV"], mp.inputs[0]); nt.links.new(mp.outputs[0], br.inputs["Vector"])
    nt.links.new(br.outputs["Color"], b.inputs["Base Color"])
    bump = nt.nodes.new("ShaderNodeBump"); bump.inputs["Strength"].default_value = 1.0; bump.inputs["Distance"].default_value = 0.08
    nt.links.new(br.outputs["Fac"], bump.inputs["Height"]); nt.links.new(bump.outputs["Normal"], b.inputs["Normal"])
    b.inputs["Metallic"].default_value = 0.8; b.inputs["Roughness"].default_value = 0.3
    return m

def rail_mat():
    m, nt, b, _ = node_mat("rail")
    b.inputs["Base Color"].default_value = (0.025, 0.025, 0.032, 1); b.inputs["Metallic"].default_value = 1.0; b.inputs["Roughness"].default_value = 0.42
    return m

M_COIN, M_LOGO = coin_body_mat(), coin_logo_mat()
M_RING, M_NEON = ring_mats()
M_TRACK, M_RAIL = track_mat(), rail_mat()

def link(o):
    sc.collection.objects.link(o); return o

# ---------------- track ----------------
def build_track(path, d0, d1, name, step=0.12, bank=0.0, width=None):
    TW = width or TRACK_W
    bm = bmesh.new(); uvl = bm.loops.layers.uv.new()
    WALL, LIP, DEPTH = 0.55, 0.3, 1.0
    prof = [(-TW / 2 - LIP, WALL), (-TW / 2, WALL), (-TW / 2, 0.0), (TW / 2, 0.0), (TW / 2, WALL), (TW / 2 + LIP, WALL),
            (TW / 2 + LIP, -DEPTH), (-TW / 2 - LIP, -DEPTH)]
    TILED = {2: TW, 5: WALL + DEPTH, 7: WALL + DEPTH}   # face index -> its width for the tile UVs
    rings, us = [], []
    d, side_prev = d0, None
    while d <= d1 + 1e-6:
        p, t = path.at(d)
        side = t.cross(Z)
        side = side.normalized() if side.length > 0.35 or side_prev is None else side_prev
        side_prev = side
        side, up = banked(p, t, side, bank)
        base = p - up * R   # surface under the coin centre
        rings.append([base + side * x + up * y for x, y in prof]); us.append(d)
        d += step
    # un-fold tight bends: smooth every profile column along the track
    for _ in range(40):
        rings = [rings[0]] + [[(rings[i - 1][j] + rings[i][j] * 2 + rings[i + 1][j]) / 4 for j in range(len(prof))] for i in range(1, len(rings) - 1)] + [rings[-1]]
    rings = [[bm.verts.new(v) for v in r] for r in rings]
    n = len(prof)
    faces_top = []
    for i in range(len(rings) - 1):
        for j in range(n):
            a, b2 = rings[i][j], rings[i][(j + 1) % n]
            c, e = rings[i + 1][(j + 1) % n], rings[i + 1][j]
            f = bm.faces.new((a, b2, c, e))
            f.material_index = 0 if j in TILED else 1
            for lp, (uu, vv) in zip(f.loops, ((us[i], j), (us[i], j + 1), (us[i + 1], j + 1), (us[i + 1], j))):
                if j == 2:  # running surface: u along the track, v across it
                    vx = {2: 0.0, 3: TW}[min(max(j, 2), 3)] if False else None
                lp[uvl].uv = (uu, 0)
    # proper UVs for the running surface (j == 2 spans x from -W/2 to W/2)
    for f in bm.faces:
        if f.material_index == 0:
            for lp in f.loops:
                v = lp.vert
            # handled below
    # closed end caps (clean, solid track ends instead of an open cut)
    cap0 = bm.faces.new(list(reversed(rings[0]))); cap0.material_index = 1
    cap1 = bm.faces.new(rings[-1]); cap1.material_index = 1
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    # recompute uv for running surface from geometry order
    uvd = me.uv_layers.active.data
    k = 0
    for i in range(len(rings) - 1):
        for j in range(n):
            poly = me.polygons[k]
            if j in TILED:
                wv = TILED[j]
                vals = ((us[i], 0.0), (us[i], wv), (us[i + 1], wv), (us[i + 1], 0.0))
                for li, (uu, vv) in zip(poly.loop_indices, vals): uvd[li].uv = (uu * 1.15, vv * 1.15)
            k += 1
    me.materials.append(M_TRACK); me.materials.append(M_RAIL)
    for p in me.polygons: p.use_smooth = True
    o = link(bpy.data.objects.new(name, me))
    return o

build_track(PATH, 0.0, UPPER_TRACK_END, "track_upper", bank=BANK_UP, width=3.4)
build_track(PATH, LOWER_TRACK_START, PATH.L, "track_lower", bank=BANK_LOW, width=3.6)

# ---------------- portal ----------------
def portal():
    # dark dish
    bpy.ops.mesh.primitive_cylinder_add(vertices=128, radius=PORTAL_R * 0.97, depth=0.12, location=(0, 0, -0.07))
    dish = bpy.context.active_object; dish.name = "dish"
    m, nt, b, _ = node_mat("dish"); b.inputs["Base Color"].default_value = (0.03, 0.01, 0.06, 1); b.inputs["Metallic"].default_value = 1.0; b.inputs["Roughness"].default_value = 0.15
    dish.data.materials.append(m)
    # thin bright rim
    bpy.ops.mesh.primitive_torus_add(major_radius=PORTAL_R, minor_radius=0.022, major_segments=192, minor_segments=12, location=(0, 0, 0))
    rim = bpy.context.active_object; rim.name = "rim"
    m, nt, b, _ = node_mat("rim"); b.inputs["Emission Color"].default_value = (0.85, 0.7, 1.0, 1); b.inputs["Emission Strength"].default_value = 1.2; b.inputs["Base Color"].default_value = (0.8, 0.7, 1, 1)
    rim.data.materials.append(m)
    # liquid blob: 7-lobed outline, emissive radial gradient (white-lilac centre -> magenta edge)
    bm = bmesh.new(); N = 210; vs = []
    for i in range(N):
        a = i / N * math.tau
        r = 1.28 * (1 + 0.075 * math.cos(7 * a) + 0.02 * math.cos(3 * a + 1))
        vs.append(bm.verts.new((r * math.cos(a), r * math.sin(a), 0.03)))
    f = bm.faces.new(vs)
    bmesh.ops.triangle_fill(bm, use_beauty=True, edges=bm.edges) if False else None
    me = bpy.data.meshes.new("blob"); bm.to_mesh(me); bm.free()
    blob = link(bpy.data.objects.new("blob", me))
    sol = blob.modifiers.new("s", "SOLIDIFY"); sol.thickness = 0.06
    m, nt, b, out = node_mat("blob")
    tc = nt.nodes.new("ShaderNodeTexCoord"); vm = nt.nodes.new("ShaderNodeVectorMath"); vm.operation = "LENGTH"
    cr = nt.nodes.new("ShaderNodeValToRGB"); el = cr.color_ramp.elements
    el[0].position, el[0].color = 0.0, (1.0, 1.0, 1.0, 1)
    el[1].position, el[1].color = 1.0, (1.0, 0.04, 0.85, 1)
    e = el.new(0.5); e.color = (0.78, 0.72, 1.0, 1)
    e = el.new(0.82); e.color = (0.7, 0.3, 1.0, 1)
    mp = nt.nodes.new("ShaderNodeMath"); mp.operation = "DIVIDE"; mp.inputs[1].default_value = 1.38
    nt.links.new(tc.outputs["Object"], vm.inputs[0]); nt.links.new(vm.outputs["Value"], mp.inputs[0]); nt.links.new(mp.outputs[0], cr.inputs[0])
    nt.links.new(cr.outputs[0], b.inputs["Emission Color"]); b.inputs["Emission Strength"].default_value = 1.25
    b.inputs["Base Color"].default_value = (0.0, 0.0, 0.0, 1); b.inputs["Roughness"].default_value = 0.6
    blob.data.materials.append(m)
    # slow spin (7-fold symmetric -> seamless over the loop)
    blob.rotation_mode = "XYZ"
    blob.rotation_euler = (0, 0, 0); blob.keyframe_insert("rotation_euler", index=2, frame=0)
    blob.rotation_euler = (0, 0, math.tau / 7); blob.keyframe_insert("rotation_euler", index=2, frame=LOOP)
    for fc in blob.animation_data.action.fcurves:
        for kp in fc.keyframe_points: kp.interpolation = "LINEAR"
    # magenta glow light
    l = bpy.data.lights.new("portal_glow", "POINT"); l.energy = 450; l.color = MAGENTA; l.shadow_soft_size = 1.2
    lo = link(bpy.data.objects.new("portal_glow", l)); lo.location = (0, 0, 0.35)
    l2 = bpy.data.lights.new("portal_under", "POINT"); l2.energy = 35; l2.color = PURPLE; l2.shadow_soft_size = 1.0
    lo2 = link(bpy.data.objects.new("portal_under", l2)); lo2.location = (0, -0.3, -1.2)
portal()

# ---------------- coins + rings ----------------
FONTS = {}
def font(path):
    if path not in FONTS: FONTS[path] = bpy.data.fonts.load(path)
    return FONTS[path]

def eth_mesh(s=1.0):
    """Ethereum mark as a faceted relief: upper kite + lower chevron, each split along a raised centre ridge."""
    H = 0.07 * s  # relief height
    v = lambda x, y, z=0.0: (x * s, y * s, z)
    verts = [v(0, 0.78), v(0.47, 0.02), v(0, -0.25), v(-0.47, 0.02), v(0, 0.12, H),            # 0-4 upper kite + raised centre
             v(-0.47, -0.10), v(0, -0.37), v(0.47, -0.10), v(0, -0.78), v(0, -0.50, H)]       # 5-9 lower chevron + raised point
    faces = [(0, 3, 4), (0, 4, 1), (3, 2, 4), (4, 2, 1),       # upper kite: 4 facets
             (5, 9, 6), (6, 9, 7), (5, 8, 9), (9, 8, 7)]       # lower chevron: 4 facets
    me = bpy.data.meshes.new("eth"); me.from_pydata(verts, [], faces); me.update()
    bm = bmesh.new(); bm.from_mesh(me)
    ext = bmesh.ops.extrude_face_region(bm, geom=bm.faces[:])
    bmesh.ops.translate(bm, verts=[e for e in ext["geom"] if isinstance(e, bmesh.types.BMVert)], vec=(0, 0, -0.03))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:]); bm.to_mesh(me); bm.free()
    return me

def make_coin(i):
    bpy.ops.mesh.primitive_cylinder_add(vertices=96, radius=R, depth=THICK)
    c = bpy.context.active_object; c.name = f"coin{i}"
    c.rotation_euler = (math.pi / 2, 0, 0); bpy.ops.object.transform_apply(rotation=True)  # axis along Y
    bev = c.modifiers.new("b", "BEVEL"); bev.width = 0.05; bev.segments = 4; bev.limit_method = "ANGLE"
    c.data.materials.append(M_COIN)
    for p in c.data.polygons: p.use_smooth = True
    # raised inner ring + logo on both faces
    for side in (-1, 1):
        bpy.ops.mesh.primitive_torus_add(major_radius=R * 0.8, minor_radius=0.025, major_segments=96, minor_segments=8)
        t = bpy.context.active_object; t.rotation_euler = (math.pi / 2, 0, 0); t.location = (0, side * THICK / 2, 0)
        t.data.materials.append(M_LOGO); t.parent = c
        ch, fp, sz = LOGOS[i % len(LOGOS)]
        if ch == "ETH":
            lg = link(bpy.data.objects.new(f"logo{i}{side}", eth_mesh(sz))); lg.data.materials.append(M_LOGO)
        else:
            cu = bpy.data.curves.new(f"logo{i}{side}", "FONT"); cu.body = ch; cu.font = font(fp)
            cu.size = sz; cu.align_x = "CENTER"; cu.align_y = "CENTER"; cu.extrude = 0.03
            cu.bevel_depth = 0.008; cu.bevel_resolution = 2
            lg = link(bpy.data.objects.new(f"logo{i}{side}", cu)); lg.data.materials.append(M_LOGO)
        lg.rotation_euler = (math.pi / 2, 0, 0 if side < 0 else math.pi); lg.location = (0, side * (THICK / 2 + 0.02), 0)
        lg.parent = c
    return c

def make_ring(i):
    bpy.ops.mesh.primitive_torus_add(major_radius=R * 0.94, minor_radius=0.075, major_segments=128, minor_segments=16)
    r = bpy.context.active_object; r.name = f"ring{i}"; r.rotation_euler = (math.pi / 2, 0, 0); bpy.ops.object.transform_apply(rotation=True)
    r.scale = (1, 2.4, 1); bpy.ops.object.transform_apply(scale=True)
    r.data.materials.append(M_RING)
    for p in r.data.polygons: p.use_smooth = True
    for side in (-1, 1):
        bpy.ops.mesh.primitive_torus_add(major_radius=R * 0.86, minor_radius=0.04, major_segments=128, minor_segments=10)
        n = bpy.context.active_object; n.rotation_euler = (math.pi / 2, 0, 0); n.location = (0, side * 0.12, 0)
        n.data.materials.append(M_NEON); n.parent = r
        for p in n.data.polygons: p.use_smooth = True
    return r

def animate(obj, path, offset, roll_sign=1, bank=0.0):
    """offset: distance along the path at frame 0. Moves SPEED per frame, wraps every LOOP."""
    obj.rotation_mode = "QUATERNION"
    side_prev = None
    span = SPACING * 3 * math.ceil(path.L / (SPACING * 3) + 1)  # wrap length (multiple of 3 spacings keeps logos in order)
    for f in range(LOOP + 1):
        d = (offset + SPEED * f) % span
        pos, tan = path.at(d)
        side = path.side_at(d)
        side = (side - tan * side.dot(tan)).normalized()
        # bank follows the track the object is on: upper above the portal, lower below, blended through the fall
        k = max(0.0, min(1.0, (pos.z + 1.5) / 3.0))
        side, up = banked(pos, tan, side, BANK_LOW + (BANK_UP - BANK_LOW) * k)
        basis = Matrix((tan, side, up)).transposed()
        ang = roll_sign * d / R
        q = basis.to_quaternion() @ Quaternion((0, 1, 0), ang)
        obj.location = pos if d < path.L else Vector((0, 0, -60))
        obj.rotation_quaternion = q
        obj.keyframe_insert("location", frame=f); obj.keyframe_insert("rotation_quaternion", frame=f)
    if obj.animation_data and obj.animation_data.action:
        for fc in obj.animation_data.action.fcurves:
            for kp in fc.keyframe_points: kp.interpolation = "LINEAR"

# each slot = one coin (visible above the portal plane) + one ring (visible below it) on the SAME motion
n_slots = math.ceil(PATH.L / SPACING) + 3
n_slots += (3 - n_slots % 3) % 3
for i in range(n_slots):
    animate(make_coin(i), PATH, -i * SPACING)
    animate(make_ring(i), PATH, -i * SPACING)

# ---------------- camera, lights, world ----------------
cam = link(bpy.data.objects.new("cam", bpy.data.cameras.new("cam")))
cam.data.lens = 50; cam.data.sensor_width = 36
cam.location = CAM_POS
tgt = link(bpy.data.objects.new("cam_target", None)); tgt.location = (0.0, 0.0, -0.15)
con = cam.constraints.new("TRACK_TO"); con.target = tgt; con.track_axis = "TRACK_NEGATIVE_Z"; con.up_axis = "UP_Y"
sc.camera = cam

def area(name, loc, size, color, energy):
    l = bpy.data.lights.new(name, "AREA"); l.size = size; l.color = color; l.energy = energy
    o = link(bpy.data.objects.new(name, l)); o.location = loc
    c = o.constraints.new("TRACK_TO"); c.target = tgt; c.track_axis = "TRACK_NEGATIVE_Z"; c.up_axis = "UP_Y"
area("key", (-8, -9, 14), 8, (0.85, 0.85, 1.0), 4200)
area("rim", (9, 10, 7), 6, (0.6, 0.5, 1.0), 2600)
area("top", (2, 6, 18), 10, (0.9, 0.9, 1.0), 3200)
area("front", (3, -16, 4), 8, (0.8, 0.8, 1.0), 1600)
area("strip_l", (-12, -4, 6), 3, (1, 1, 1), 2500)
area("strip_r", (10, -8, 9), 3, (1, 1, 1), 2000)

w = bpy.data.worlds.new("w"); sc.world = w; w.use_nodes = True
bg = next(n for n in w.node_tree.nodes if n.type == "BACKGROUND"); bg.inputs["Color"].default_value = (0, 0, 0, 1); bg.inputs["Strength"].default_value = 0

# ---------------- render settings + glow ----------------
sc.render.engine = "CYCLES"
try:
    prefs = bpy.context.preferences.addons["cycles"].preferences
    for t in ("OPTIX", "CUDA"):
        try:
            prefs.compute_device_type = t; prefs.get_devices()
            if any(d.type == t for d in prefs.devices):
                for d in prefs.devices: d.use = True
                sc.cycles.device = "GPU"; break
        except Exception: pass
except Exception: pass
sc.cycles.samples = 96; sc.cycles.use_denoising = True
sc.cycles.max_bounces = 6; sc.cycles.transparent_max_bounces = 12
sc.render.resolution_x, sc.render.resolution_y = 2560, 1440
sc.render.image_settings.file_format = "PNG"
try: sc.view_settings.view_transform = "Standard"; sc.view_settings.look = "Medium High Contrast"
except Exception: pass

sc.use_nodes = True
tree = sc.node_tree
for n in list(tree.nodes): tree.nodes.remove(n)
rl = tree.nodes.new("CompositorNodeRLayers"); comp = tree.nodes.new("CompositorNodeComposite")
g = tree.nodes.new("CompositorNodeGlare")
try: g.glare_type = "BLOOM"
except Exception: g.glare_type = "FOG_GLOW"
g.quality = "HIGH"; g.threshold = 1.8
try: g.size = 6
except Exception: pass
try: g.mix = 0.0
except Exception: pass
tree.links.new(rl.outputs["Image"], g.inputs["Image"]); tree.links.new(g.outputs["Image"], comp.inputs["Image"])

# ---------------- run ----------------
if MODE == "preview":
    sc.frame_set(int(argv[1])); sc.render.filepath = argv[2]
    sc.render.resolution_percentage = int(argv[3]) if len(argv) > 3 else 50
    sc.cycles.samples = int(argv[4]) if len(argv) > 4 else 32
    bpy.ops.render.render(write_still=True)
elif MODE == "render":
    sc.render.filepath = argv[1]
    if len(argv) > 2: sc.cycles.samples = int(argv[2])
    bpy.ops.render.render(animation=True)
elif MODE == "save":
    bpy.ops.wm.save_as_mainfile(filepath=argv[1])
print("done", MODE)
