// Scene with Primitives - Yellow Sphere
@fragment
fn fs_main(@builtin(position) fragCoord: vec4<f32>) -> @location(0) vec4<f32> {
let uv = (fragCoord.xy - uniforms.resolution * 0.5) / min(uniforms.resolution.x, uniforms.resolution.y);

// Orbital Controll
let pitch = clamp((uniforms.mouse.y / uniforms.resolution.y), 0.05, 1.5);
let yaw = uniforms.time * 0.5; // Auto-orbits around the center

// Camera Coords
let cam_dist = 12.0; // Distance from the target
let cam_target = vec3<f32>(0.0, 0.0, 0.0);
let cam_pos = vec3<f32>(sin(yaw) * cos(pitch), sin(pitch), cos(yaw) * cos(pitch)) * cam_dist;

// Camera Matrix
let cam_forward = normalize(cam_target - cam_pos);
let cam_right = normalize(cross(cam_forward, vec3<f32>(0.0, 1.0, 0.0)));
let cam_up = cross(cam_right, cam_forward); // Re-orthogonalized up

// Ray Direction
let focal_length = 1.5;
let rd = normalize(cam_right * uv.x - cam_up * uv.y + cam_forward * focal_length);

// Ray march
let result = ray_march(cam_pos, rd);

if result.x < MAX_DIST {
// Hit something - calculate lighting
let hit_pos = cam_pos + rd * result.x;
let normal = get_normal(hit_pos);

// Diffuse Lighting
let light_pos = vec3<f32>(2.0, 5.0, -1.0);
let light_dir = normalize(light_pos - hit_pos);
let diffuse = max(dot(normal, light_dir), 0.0);

// Shadow Casting
let shadow_origin = hit_pos + normal * 0.01;
let shadow_result = ray_march(shadow_origin, light_dir);
let shadow = select(0.3, 1.0, shadow_result.x > length(light_pos - shadow_origin));

// Phong Shading

let ambient = 0.2;
var albedo = get_material_color(result.y, hit_pos);
let phong = albedo * (ambient + diffuse * shadow * 0.8);

// Exponential Fog
let fog = exp(-result.x * 0.02);
let colorSphere = mix(MAT_SKY_COLOR, phong, fog);

return vec4<f32>(gamma_correct(colorSphere), 1.0);


}

// Sky gradient
let sky = mix(MAT_SKY_COLOR, MAT_SKY_COLOR * 0.9, uv.y * 0.5 + 0.5);
return vec4<f32>(gamma_correct(sky), 1.0);
}

// Gamma Correction
fn gamma_correct(colorSphere: vec3<f32>) -> vec3<f32> {
return pow(colorSphere, vec3<f32>(1.0 / 2.2));
}

// Constants
const MAX_DIST: f32 = 100.0;
const SURF_DIST: f32 = 0.001;
const MAX_STEPS: i32 = 256;

// Material Types
const MAT_SPHERE: f32 = 1.0;
const MAT_PLANE: f32 = 0;
const MAT_CYLINDER: f32 = 2.0;

// Material Colors
const MAT_SKY_COLOR: vec3<f32> = vec3<f32>(0.7, 0.8, 0.9);
// const MAT_SPHERE_COLOR: vec3<f32> = vec3<f32>(1.0, 1.0, 0.0); // Yellow

// ==================== MATERIAL COLOR ====================

fn get_material_color(mat_id: f32, p: vec3<f32>) -> vec3<f32> {
if mat_id == MAT_SPHERE {
return scene.colorSphere;
}
else if mat_id == MAT_CYLINDER {
return scene.colorCylinder;
}
else if mat_id == MAT_PLANE {
let checker = floor(p.x) + floor(p.z);
let col1 = vec3<f32>(0.33, 0.27, 0.52);
let col2 = vec3<f32>(0.39, 0.33, 0.58);
return select(col2, col1, i32(checker) % 2 == 0);
}
return vec3<f32>(scene.colorSphere);
}

// ==================== SDF PRIMITIVES ====================

fn sd_sphere(p: vec3<f32>, r: f32) -> f32 {
return length(p) - r;
}

fn sd_plane(p: vec3<f32>, n: vec3<f32>, h: f32) -> f32 {
return dot(p, n) + h;
}

fn sd_cylinder(p: vec3<f32>, center: vec3<f32>, radius: f32, height: f32) -> f32 {
let q = p - center;  // Translation pour centrer le cylindre
let h = vec2<f32>(radius, height * 0.5);  // h.x = rayon, h.y = demi-hauteur
let d = abs(vec2<f32>(length(q.xz), q.y)) - h;
return min(max(d.x, d.y), 0.0) + length(max(d, vec2<f32>(0.0)));
}

// SDF Operations
fn op_union(d1: f32, d2: f32) -> f32 {
return min(d1, d2);
}

fn op_subtract(d1: f32, d2: f32) -> f32 {
return max(-d1, d2);
}

fn op_intersect(d1: f32, d2: f32) -> f32 {
return max(d1, d2);
}

fn op_smooth_union(d1: f32, d2: f32, k: f32) -> f32 {
let h = clamp(0.5 + 0.5 * (d2 - d1) / k, 0.0, 1.0);
return mix(d2, d1, h) - k * h * (1.0 - h);
}

fn op_smooth_subtract( d1: f32, d2: f32, k: f32 ) -> f32
{
return -op_smooth_union(d1,-d2,k);
}

// Transformations SDF
fn op_translate(p: vec3<f32>, offset: vec3<f32>) -> vec3<f32> {
return p - offset;
}

fn op_rotate_y(p: vec3<f32>, angle: f32) -> vec3<f32> {
let c = cos(angle);
let s = sin(angle);
return vec3<f32>(
p.x * c + p.z * s,
p.y,
-p.x * s + p.z * c
);
}

// ==================== SCENE DESCRIPTION ====================

fn get_dist(p: vec3<f32>) -> vec2<f32> {
var res = vec2<f32>(MAX_DIST, -1.0);

// Get sphere directly from storage buffer (no Scene wrapper)
let centerSphere = scene.centerSphere;
let radiusSphere = scene.radiusSphere;

let sphere_dist = sd_sphere(p - centerSphere, radiusSphere);

let cylinder_dist = sd_cylinder(p, scene.centerCylinder, scene.radiusCylinder*abs(sin(uniforms.time)), scene.heightCylinder);

// Opération modulaire : 0 = union, 1 = subtract, 2 = smooth subtract
let operation_type = 2;  // 1 pour subtract (cylindre soustrait de la sphère)
var combined_dist = sphere_dist;  // Par défaut, la sphère
var combined_mat_id = MAT_SPHERE;

if operation_type == 1 {
combined_dist = op_subtract(cylinder_dist, sphere_dist);
combined_mat_id = MAT_SPHERE;  // Matériau de la sphère creuse
} else if operation_type == 2 {
let k = 0.8;
combined_dist = op_smooth_subtract(cylinder_dist, sphere_dist, k);
combined_mat_id = MAT_SPHERE;
} else {
// Union normale (avec tests individuels)
combined_dist = op_union(sphere_dist, cylinder_dist);
combined_mat_id = select(MAT_CYLINDER, MAT_SPHERE, sphere_dist < cylinder_dist);

// Tests individuels seulement pour union

if sphere_dist < res.x {
  res = vec2<f32>(sphere_dist, MAT_SPHERE);
}

if cylinder_dist < res.x {
  res = vec2<f32>(cylinder_dist, MAT_CYLINDER);
}


}

if combined_dist < res.x {
res = vec2<f32>(combined_dist, combined_mat_id);
}

// Ground plane
let plane_dist = sd_plane(p, vec3<f32>(0.0, 1.0, 0.0), 0.5);
if plane_dist < res.x {
res = vec2<f32>(plane_dist, MAT_PLANE);
}

return res;
}

// ==================== RAY MARCHING ====================

fn ray_march(ro: vec3<f32>, rd: vec3<f32>) -> vec2<f32> {
var d = 0.0;
var mat_id = -1.0;

for (var i: i32 = 0; i < MAX_STEPS; i++) {
let p = ro + rd * d;
let dist_mat = get_dist(p);
d += dist_mat.x;
mat_id = dist_mat.y;

if dist_mat.x < SURF_DIST || d > MAX_DIST {

  break;

}


}

return vec2<f32>(d, mat_id);
}

// ==================== NORMAL CALCULATION ====================

fn get_normal(p: vec3<f32>) -> vec3<f32> {
let e = vec2<f32>(0.001, 0.0);
let n = vec3<f32>(
get_dist(p + e.xyy).x - get_dist(p - e.xyy).x,
get_dist(p + e.yxy).x - get_dist(p - e.yxy).x,
get_dist(p + e.yyx).x - get_dist(p - e.yyx).x
);
return normalize(n);
}