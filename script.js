const shaders = {};
      let fallbackShader = `// Fragment shader - runs once per pixel
@fragment
fn fs_main(@builtin(position) fragCoord: vec4<f32>) -> @location(0) vec4<f32> {
    // Simple gradient as fallback
    let uv = fragCoord.xy / uniforms.resolution;
    return vec4<f32>(uv, 0.5, 1.0);
}`;

      CodeMirror.defineSimpleMode("wgsl", {
              start: [
                { regex: /\b(fn|let|var|const|if|else|for|while|loop|return|break|continue|discard|switch|case|default|struct|type|alias)\b/, token: "keyword" },
                { regex: /\b(bool|i32|u32|f32|f16|vec2|vec3|vec4|mat2x2|mat3x3|mat4x4|array|sampler|texture_2d|texture_3d)\b/, token: "type" },
                { regex: /\b(vec2|vec3|vec4|mat2x2|mat3x3|mat4x4|array)<[^>]+>/, token: "type" },
                { regex: /\b(abs|acos|all|any|asin|atan|atan2|ceil|clamp|cos|cosh|cross|degrees|determinant|distance|dot|exp|exp2|faceforward|floor|fma|fract|frexp|inversesqrt|ldexp|length|log|log2|max|min|mix|modf|normalize|pow|radians|reflect|refract|round|sign|sin|sinh|smoothstep|sqrt|step|tan|tanh|transpose|trunc)\b/, token: "builtin" },
                { regex: /@(vertex|fragment|compute|builtin|location|binding|group|stage|workgroup_size|interpolate|invariant)/, token: "attribute" },
                { regex: /\b\d+\.?\d*[fu]?\b|0x[0-9a-fA-F]+[ul]?/, token: "number" },
                { regex: /\/\/.*/, token: "comment" },
                { regex: /\/\*/, token: "comment", next: "comment" },
                { regex: /[+\-*/%=<>!&|^~?:]/, token: "operator" },
                { regex: /[{}()\[\];,\.]/, token: "punctuation" },
              ],
              comment: [
                { regex: /.*?\*\//, token: "comment", next: "start" },
                { regex: /.*/, token: "comment" },
              ],
            }); // prettier-ignore

      const editor = CodeMirror.fromTextArea(
        document.getElementById("code-editor"),
        {
          mode: "wgsl",
          theme: "gruvbox-dark-hard",
          lineNumbers: true,
          lineWrapping: true,
          value: fallbackShader,
          tabSize: 2,
          indentUnit: 2,
          viewportMargin: Infinity,
          scrollbarStyle: "native",
        },
      );
      editor.setValue(fallbackShader);

      let device;
      let context;
      let pipeline;
      let uniformBuffer;
      let sceneBuffer;
      let bindGroup;
      let startTime = performance.now();
      let lastFrameTime = startTime;
      let frameCount = 0;
      let lastFpsUpdate = startTime;
      let mouseX = 0;
      let mouseY = 0;
      let mouseDown = false;
      let isPanelOpen = true;
      let isFullscreen = false;

      const sphereJaune = {
        x: 0.0,
        y: 1.0,
        z: 0.0,
        r: 1.0,
        color: [1.0, 1.0, 0.0] // RGB yellow
      };
      const cylinderJaune = {
        x: 0.0,
        y: 1.0,
        z: 0.0,
        r: 1.0,
        height: 3.0,
        color: [1.0, 0.0, 0.0] // RGB yellow
      };

      // Helper to convert Hex color to 0-1 Floats
      function hexToRgb(hex) {
        const bigint = parseInt(hex.substring(1), 16);
        const r = ((bigint >> 16) & 255) / 255;
        const g = ((bigint >> 8) & 255) / 255;
        const b = (bigint & 255) / 255;
        return [r, g, b];
      }

      const $ = (id) => document.getElementById(id);
      const canvas = $("canvas");
      const errorMsg = $("error-message");
      const compileBtn = $("compile-btn");
      const fullscreenBtn = $("fullscreen-btn");
      const fullscreenEnterIcon = $("fullscreen-enter-icon");
      const fullscreenExitIcon = $("fullscreen-exit-icon");
      const canvasContainer = $("canvas-container");
      const editorContainer = $("editor-container");
      const shaderSelector = $("shader-selector");
      const uniforms = {
        resolution: {
          label: "resolution",
          initial: "0 × 0",
          update: (w, h) => `${w} × ${h}`,
        },
        time: {
          label: "time",
          initial: "0.00s",
          update: (t) => `${t.toFixed(2)}s`,
        },
        deltaTime: {
          label: "deltaTime",
          initial: "0.00ms",
          update: (dt) => `${(dt * 1000).toFixed(2)}ms`,
        },
        mousexy: {
          label: "mouse.xy",
          initial: "0, 0",
          update: (x, y) => `${Math.round(x)}, ${Math.round(y)}`,
        },
        mousez: {
          label: "mouse.z",
          initial:
            '<span class="inline-block w-2 h-2 rounded-full" id="mouse-ind" style="background:#928374"></span>',
          update: (down) => {
            $("mouse-ind").style.background = down ? "#b8bb26" : "#928374";
            return null;
          },
        },
        frame: {
          label: "frame",
          initial: "0",
          update: (f) => f.toString(),
        },
      };

      $("uniforms-table").innerHTML = Object.entries(uniforms)
        .map(
          ([key, u]) =>
            `<tr class="border-b" style="border-color:#3c3836"><td class="py-1.5 font-semibold" style="color:#fe8019">${u.label}</td><td class="py-1.5 text-right font-mono" id="u-${key}">${u.initial}</td></tr>`,
        )
        .join("");

      canvas.addEventListener("mousemove", (e) => {
        const rect = canvas.getBoundingClientRect();
        const dpr = devicePixelRatio || 1;
        [mouseX, mouseY] = [
          (e.clientX - rect.left) * dpr,
          (e.clientY - rect.top) * dpr,
        ];
      });
      canvas.addEventListener("mousedown", () => (mouseDown = true));
      canvas.addEventListener("mouseup", () => (mouseDown = false));
      canvas.addEventListener("mouseleave", () => (mouseDown = false));

      // Sphere control sliders
      document.getElementById("sphere-x").oninput = (e) => {
        sphereJaune.x = parseFloat(e.target.value);
        document.getElementById("sphere-x-value").textContent = sphereJaune.x.toFixed(1);
      };
      document.getElementById("sphere-y").oninput = (e) => {
        sphereJaune.y = parseFloat(e.target.value);
        document.getElementById("sphere-y-value").textContent = sphereJaune.y.toFixed(1);
      };
      document.getElementById("sphere-z").oninput = (e) => {
        sphereJaune.z = parseFloat(e.target.value);
        document.getElementById("sphere-z-value").textContent = sphereJaune.z.toFixed(1);
      };
      document.getElementById("sphere-radius").oninput = (e) => {
        sphereJaune.r = parseFloat(e.target.value);
        document.getElementById("sphere-radius-value").textContent = sphereJaune.r.toFixed(1);
      };
      document.getElementById("sphere-color").oninput = (e) => {
        sphereJaune.color = hexToRgb(e.target.value);
      };
      // Cylinder control sliders
      document.getElementById("cylinder-x").oninput = (e) => {
        cylinderJaune.x = parseFloat(e.target.value);
        document.getElementById("cylinder-x-value").textContent = cylinderJaune.x.toFixed(1);
      };
      document.getElementById("cylinder-y").oninput = (e) => {
        cylinderJaune.y = parseFloat(e.target.value);
        document.getElementById("cylinder-y-value").textContent = cylinderJaune.y.toFixed(1);
      };
      document.getElementById("cylinder-z").oninput = (e) => {
        cylinderJaune.z = parseFloat(e.target.value);
        document.getElementById("cylinder-z-value").textContent = cylinderJaune.z.toFixed(1);
      };
      document.getElementById("cylinder-radius").oninput = (e) => {
        cylinderJaune.r = parseFloat(e.target.value);
        document.getElementById("cylinder-radius-value").textContent = cylinderJaune.r.toFixed(1);
      };
      document.getElementById("cylinder-color").oninput = (e) => {
        cylinderJaune.color = hexToRgb(e.target.value);
      };

      $("panel-toggle").onclick = () => {
        isPanelOpen = !isPanelOpen;
        $("uniforms-panel").style.width = isPanelOpen ? "250px" : "24px";
        $("panel-content").style.display = isPanelOpen ? "flex" : "none";
        $("toggle-arrow").textContent = isPanelOpen ? "▶" : "◀";
      };

      const vertexShader = `@vertex
fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> @builtin(position) vec4<f32> {
  var pos = array<vec2<f32>, 3>(vec2<f32>(-1.0, -1.0), vec2<f32>(3.0, -1.0), vec2<f32>(-1.0, 3.0));
  return vec4<f32>(pos[vertexIndex], 0.0, 1.0);
}`;

      const uniformsStruct = `struct Uniforms {
  resolution: vec2<f32>, time: f32, deltaTime: f32, mouse: vec4<f32>, frame: u32,
  _padding: u32, _padding2: u32, _padding3: u32,
}
@group(0) @binding(0) var<uniform> uniforms: Uniforms;`;

      const sceneStruct = `struct Scene {
  centerSphere: vec3<f32>,
  radiusSphere: f32,
  colorSphere: vec3<f32>,
  centerCylinder: vec3<f32>,
  radiusCylinder: f32,
  heightCylinder: f32,
  colorCylinder: vec3<f32>,
}

@group(0) @binding(1) var<uniform> scene: Scene;`;

      async function initWebGPU() {
        if (!navigator.gpu)
          return ((errorMsg.textContent = "WebGPU not supported"), false);
        const adapter = await navigator.gpu.requestAdapter();
        if (!adapter) return ((errorMsg.textContent = "No GPU adapter"), false);
        device = await adapter.requestDevice();
        context = canvas.getContext("webgpu");
        const format = navigator.gpu.getPreferredCanvasFormat();
        context.configure({ device, format });
        uniformBuffer = device.createBuffer({
          size: 64,
          usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        sceneBuffer = device.createBuffer({
          size: 112,
          usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        await compileShader(fallbackShader);
        return true;
      }

      async function compileShader(fragmentCode) {
        const start = performance.now();
        try {
          errorMsg.classList.add("hidden");
          const code = vertexShader + "\n" + uniformsStruct + "\n" + sceneStruct + "\n" + fragmentCode; // prettier-ignore
          const shaderModule = device.createShaderModule({ code });
          const info = await shaderModule.getCompilationInfo();
          const lineOffset = (vertexShader + "\n" + uniformsStruct + "\n" + sceneStruct).split("\n").length; // prettier-ignore
          const errors = info.messages
            .filter((m) => m.type === "error")
            .map((m) => {
              const fragmentLine = m.lineNum - lineOffset;
              return fragmentLine > 0
                ? `Line ${fragmentLine}: ${m.message}`
                : `Line ${m.lineNum}: ${m.message}`;
            })
            .join("\n");
          if (errors)
            return (
              (errorMsg.textContent = "Shader error:\n" + errors),
              errorMsg.classList.remove("hidden")
            );

          const format = navigator.gpu.getPreferredCanvasFormat();
          const bindGroupLayout = device.createBindGroupLayout({
            entries: [
              {
                binding: 0,
                visibility: GPUShaderStage.FRAGMENT,
                buffer: { type: "uniform" },
              },
              {
                binding: 1,
                visibility: GPUShaderStage.FRAGMENT,
                buffer: { type: "uniform" },  // Scene buffer as uniform
              },
            ],
          });
          pipeline = device.createRenderPipeline({
            layout: device.createPipelineLayout({
              bindGroupLayouts: [bindGroupLayout],
            }),
            vertex: { module: shaderModule, entryPoint: "vs_main" },
            fragment: {
              module: shaderModule,
              entryPoint: "fs_main",
              targets: [{ format }],
            },
            primitive: { topology: "triangle-list" },
          });
          bindGroup = device.createBindGroup({
            layout: bindGroupLayout,
            entries: [
              { binding: 0, resource: { buffer: uniformBuffer } },
              { binding: 1, resource: { buffer: sceneBuffer } },
            ],
          });
          console.log("BindGroup created with sceneBuffer:", sceneBuffer); // Debug
          $("compile-time").textContent = `${(performance.now() - start).toFixed(2)}ms`; // prettier-ignore
        } catch (e) {
          errorMsg.textContent = "Compile error: " + e.message;
          errorMsg.classList.remove("hidden");
        }
      }

      function render() {
        if (!pipeline) return;
        const currentTime = performance.now();
        const deltaTime = (currentTime - lastFrameTime) / 1000;
        const elapsedTime = (currentTime - startTime) / 1000;
        const data = [canvas.width, canvas.height, elapsedTime, deltaTime, mouseX, mouseY, mouseDown ? 1 : 0, 0, frameCount, 0, 0, 0]; // prettier-ignore
        device.queue.writeBuffer(uniformBuffer, 0, new Float32Array(data));

        const SceneData = new Float32Array([
  // centerSphere (indices 0-3 : vec3<f32> + padding 4 octets)
  sphereJaune.x, sphereJaune.y, sphereJaune.z,

  // radiusSphere (indices 4-7 : f32 + padding 12 octets)
  sphereJaune.r, 
  
  // colorSphere (indices 8-11 : vec3<f32> + padding 4 octets)
  sphereJaune.color[0], sphereJaune.color[1], sphereJaune.color[2], 0.0,
  
  // centerCylinder (indices 12-15 : vec3<f32> + padding 4 octets)
  cylinderJaune.x, cylinderJaune.y, cylinderJaune.z,
  
  // radiusCylinder (indices 16-19 : f32 + padding 12 octets)
  cylinderJaune.r,
  
  // heightCylinder (indices 20-23 : f32 + padding 12 octets)
  cylinderJaune.height, 0.0, 0.0, 0.0, 
  
  // colorCylinder (indices 24-26 : vec3<f32> + padding 4 octets)
  cylinderJaune.color[0], cylinderJaune.color[1], cylinderJaune.color[2], 0.0,
]);
        device.queue.writeBuffer(sceneBuffer, 0, SceneData);
        console.log(SceneData[7],SceneData[8],SceneData[9], SceneData[10], SceneData[11],SceneData[12], SceneData[13], SceneData[14], SceneData[15], SceneData[16]);
        const val = uniforms.resolution.update(canvas.width, canvas.height);
        if (val) $("u-resolution").textContent = val;
        $("u-time").textContent = uniforms.time.update(elapsedTime);
        $("u-deltaTime").textContent = uniforms.deltaTime.update(deltaTime);
        $("u-mousexy").textContent = uniforms.mousexy.update(mouseX, mouseY);
        $("u-frame").textContent = uniforms.frame.update(frameCount);
        uniforms.mousez.update(mouseDown);

        lastFrameTime = currentTime;

        const encoder = device.createCommandEncoder();
        const pass = encoder.beginRenderPass({
          colorAttachments: [
            {
              view: context.getCurrentTexture().createView(),
              loadOp: "clear",
              clearValue: { r: 0, g: 0, b: 0, a: 1 },
              storeOp: "store",
            },
          ],
        });
        pass.setPipeline(pipeline);
        pass.setBindGroup(0, bindGroup);
        pass.draw(3);
        pass.end();
        device.queue.submit([encoder.finish()]);

        if (++frameCount && currentTime - lastFpsUpdate > 100) {
          const fps = Math.round(frameCount / ((currentTime - lastFpsUpdate) / 1_000)); // prettier-ignore
          $("fps").textContent = fps;
          $("frame-time").textContent = `${((currentTime - lastFpsUpdate) / frameCount).toFixed(1)}ms`; // prettier-ignore
          frameCount = 0;
          lastFpsUpdate = currentTime;
        }
        requestAnimationFrame(render);
      }

      function resizeCanvas() {
        const container = $("canvas-container");
        const dpr = devicePixelRatio || 1;
        canvas.width = container.clientWidth * dpr;
        canvas.height = container.clientHeight * dpr;
        canvas.style.width = container.clientWidth + "px";
        canvas.style.height = container.clientHeight + "px";
      }

      compileBtn.onclick = () => compileShader(editor.getValue());

      function toggleFullscreen() {
        if (
          !document.fullscreenElement &&
          !document.webkitFullscreenElement &&
          !document.mozFullScreenElement &&
          !document.msFullscreenElement
        ) {
          const elem = canvasContainer;
          if (elem.requestFullscreen) {
            elem.requestFullscreen();
          } else if (elem.webkitRequestFullscreen) {
            elem.webkitRequestFullscreen();
          } else if (elem.mozRequestFullScreen) {
            elem.mozRequestFullScreen();
          } else if (elem.msRequestFullscreen) {
            elem.msRequestFullscreen();
          }
        } else {
          if (document.exitFullscreen) {
            document.exitFullscreen();
          } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
          } else if (document.mozCancelFullScreen) {
            document.mozCancelFullScreen();
          } else if (document.msExitFullscreen) {
            document.msExitFullscreen();
          }
        }
      }

      function updateFullscreenUI() {
        const fullscreenElement =
          document.fullscreenElement ||
          document.webkitFullscreenElement ||
          document.mozFullScreenElement ||
          document.msFullscreenElement;

        isFullscreen = !!fullscreenElement;
        if (isFullscreen) {
          fullscreenEnterIcon.classList.add("hidden");
          fullscreenExitIcon.classList.remove("hidden");
          editorContainer.style.display = "none";
          canvasContainer.classList.remove("landscape:w-1/2", "portrait:h-1/2");
          canvasContainer.classList.add("w-full", "h-full");
        } else {
          fullscreenEnterIcon.classList.remove("hidden");
          fullscreenExitIcon.classList.add("hidden");
          editorContainer.style.display = "";
          canvasContainer.classList.remove("w-full", "h-full");
          canvasContainer.classList.add("landscape:w-1/2", "portrait:h-1/2");
        }

        setTimeout(resizeCanvas, 50);
      }

      fullscreenBtn.onclick = toggleFullscreen;
      document.addEventListener("fullscreenchange", updateFullscreenUI);
      document.addEventListener("webkitfullscreenchange", updateFullscreenUI);
      document.addEventListener("mozfullscreenchange", updateFullscreenUI);
      document.addEventListener("MSFullscreenChange", updateFullscreenUI);

      document.addEventListener("keydown", (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
          e.preventDefault();
          compileShader(editor.getValue());
        }
        if (
          e.key === "f" &&
          !e.ctrlKey &&
          !e.metaKey &&
          !e.altKey &&
          !e.shiftKey
        ) {
          if (document.activeElement !== editor.getInputField()) {
            e.preventDefault();
            toggleFullscreen();
          }
        }
      });
      window.addEventListener("resize", resizeCanvas);

      // Handle shader selection
      shaderSelector.addEventListener("change", (e) => {
        const selectedShader = e.target.value;
        if (selectedShader && shaders[selectedShader]) {
          editor.setValue(shaders[selectedShader].content);
          compileShader(shaders[selectedShader].content);
        }
      });

      // Load shaders from files
      async function loadShaders() {
        let loadedCount = 0;
        let manifest = null;

        // Try to load the manifest file
        try {
          const manifestResponse = await fetch("./shaders/manifest.json");
          if (manifestResponse.ok) {
            manifest = await manifestResponse.json();
            console.log("Loaded shader manifest");
          }
        } catch (err) {
          console.log(
            "No manifest found, will try loading mouse.wgsl directly",
          );
        }

        // If we have a manifest, use it. Otherwise, try loading mouse.wgsl
        const shaderList = manifest?.shaders || [
          { file: "mouse.wgsl", name: "Mouse Interaction" },
        ];

        // Load each shader file
        for (const shaderInfo of shaderList) {
          try {
            const response = await fetch(`./shaders/${shaderInfo.file}`);
            if (response.ok) {
              const content = await response.text();
              shaders[shaderInfo.file] = {
                content: content,
                name: shaderInfo.name || shaderInfo.file.replace(".wgsl", ""),
                description: shaderInfo.description || "",
              };
              loadedCount++;
              console.log(`Loaded shader: ${shaderInfo.file}`);
            }
          } catch (err) {
            console.error(`Failed to load shader ${shaderInfo.file}:`, err);
          }
        }

        // Populate shader selector after loading
        if (loadedCount > 0) {
          // Clear existing options except the first one
          while (shaderSelector.options.length > 1) {
            shaderSelector.remove(1);
          }

          // Add loaded shaders to selector
          Object.keys(shaders).forEach((filename) => {
            const option = document.createElement("option");
            option.value = filename;
            option.textContent = shaders[filename].name;
            if (shaders[filename].description) {
              option.title = shaders[filename].description;
            }
            shaderSelector.appendChild(option);
          });

          // Set first shader as default
          const firstShader = Object.keys(shaders)[0];
          if (firstShader) {
            fallbackShader = shaders[firstShader].content;
            editor.setValue(fallbackShader);
            shaderSelector.value = firstShader;
          }
        } else {
          console.log("No shaders loaded, using fallback");
        }
      }

      // Main initialization
      const main = async () => {
        await loadShaders();
        resizeCanvas();
        if (await initWebGPU()) render();
      };
      main();

