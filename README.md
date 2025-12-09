# WebGPU Interactive Ray Marching Scene Editor 🚀

**[Live Demo](https://[your-username].github.io/[repo-name]/)**

An interactive 3D scene editor built with WebGPU and ray marching, allowing real-time manipulation of 3D primitives via a user-friendly UI panel.

![Editor Demo](WebGPU.mp4)
---
## Features

- **Real-time scene editing**: Adjust position, size, and color of objects directly from the control panel.
- **WebGPU/WGSL integration**: Uses uniform buffers to pass scene data to the shader.
- **Dynamic UI**: Interactive controls for each primitive, with instant updates so no recompilation is needed.
---
## Tech Stack

- **WebGPU** / **WGSL**: GPU rendering and compute.
- **JavaScript** / **HTML5**: UI and application logic.
- **Ray Marching**: 3D rendering using Signed Distance Functions (SDFs).
---
## Local Development
1. Clone this repository:
   ```bash
   git clone https://github.com/[your-username]/[repo-name].git
2. Start a local server (required for WebGPU):
python -m http.server
3. Open http://localhost:8000 in your browser.
---
## Project Structure

- index.html : User interface and editor panel.
- main.js : Core logic, buffer management, and rendering.
- shaders/raymarch_scene.wgsl : Main shader using scene uniforms.
- README.md : Documentation and instructions.
---
## Resources used

- [Inigo Quilez - SDF Articles](iquilezles.org/articles)
- [WebGPU Fundamentals](webgpufundamentals.org)
- [WGSL Specification](www.w3.org/TR/WGSL/)
