// ============================================
// 간단한 WebGL 구현 - 로딩페이지 물어뜯는 효과 전용
// ============================================

export class LoadingPlane {
    constructor(container, params) {
        this.container = container;
        this.canvas = null;
        this.gl = null;
        this.program = null;
        this.uniforms = {};
        this.textures = {};
        this.animationId = null;
        this.isReady = false;
        this.onReadyCallback = null;
        this.onRenderCallback = null;

        this.vertexShader = params.vertexShader;
        this.fragmentShader = params.fragmentShader;
        this.params = params;

        this._init();
    }

    _init() {
        // Canvas 생성
        this.canvas = document.createElement('canvas');
        this.canvas.style.position = 'absolute';
        this.canvas.style.top = '0';
        this.canvas.style.left = '0';
        this.canvas.style.width = '100%';
        this.canvas.style.height = '100%';
        this.container.appendChild(this.canvas);

        // WebGL 컨텍스트
        this.gl = this.canvas.getContext('webgl') || this.canvas.getContext('experimental-webgl');
        if (!this.gl) {
            console.error('WebGL not supported');
            return;
        }

        // 리사이즈
        this._resize();
        window.addEventListener('resize', () => this._resize());

        // 셰이더 컴파일
        this._setupShaders();
        this._setupGeometry();
        this._setupUniforms();

        // 렌더링 시작
        this._render();
    }

    _resize() {
        const rect = this.container.getBoundingClientRect();
        const dpr = Math.min(1.5, window.devicePixelRatio);

        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;

        if (this.gl) {
            this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        }
    }

    _compileShader(source, type) {
        const shader = this.gl.createShader(type);
        this.gl.shaderSource(shader, source);
        this.gl.compileShader(shader);

        if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
            console.error('Shader compile error:', this.gl.getShaderInfoLog(shader));
            return null;
        }
        return shader;
    }

    _setupShaders() {
        const vs = this._compileShader(this.vertexShader, this.gl.VERTEX_SHADER);
        const fs = this._compileShader(this.fragmentShader, this.gl.FRAGMENT_SHADER);

        if (!vs || !fs) return;

        this.program = this.gl.createProgram();
        this.gl.attachShader(this.program, vs);
        this.gl.attachShader(this.program, fs);
        this.gl.linkProgram(this.program);

        if (!this.gl.getProgramParameter(this.program, this.gl.LINK_STATUS)) {
            console.error('Program link error:', this.gl.getProgramInfoLog(this.program));
            return;
        }

        this.gl.useProgram(this.program);
    }

    _setupGeometry() {
        // Fullscreen quad
        const vertices = new Float32Array([
            -1, -1, 0,
             1, -1, 0,
             1,  1, 0,
            -1,  1, 0
        ]);

        const uvs = new Float32Array([
            0, 1,
            1, 1,
            1, 0,
            0, 0
        ]);

        const indices = new Uint16Array([0, 1, 2, 0, 2, 3]);

        // Position buffer
        const posBuffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, posBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, vertices, this.gl.STATIC_DRAW);

        const posLoc = this.gl.getAttribLocation(this.program, 'aVertexPosition');
        this.gl.enableVertexAttribArray(posLoc);
        this.gl.vertexAttribPointer(posLoc, 3, this.gl.FLOAT, false, 0, 0);

        // UV buffer
        const uvBuffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, uvBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, uvs, this.gl.STATIC_DRAW);

        const uvLoc = this.gl.getAttribLocation(this.program, 'aTextureCoord');
        this.gl.enableVertexAttribArray(uvLoc);
        this.gl.vertexAttribPointer(uvLoc, 2, this.gl.FLOAT, false, 0, 0);

        // Index buffer
        this.indexBuffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
        this.gl.bufferData(this.gl.ELEMENT_ARRAY_BUFFER, indices, this.gl.STATIC_DRAW);
    }

    _setupUniforms() {
        // MVP 매트릭스 (identity)
        const identity = new Float32Array([
            1, 0, 0, 0,
            0, 1, 0, 0,
            0, 0, 1, 0,
            0, 0, 0, 1
        ]);

        const mvLoc = this.gl.getUniformLocation(this.program, 'uMVMatrix');
        const pLoc = this.gl.getUniformLocation(this.program, 'uPMatrix');

        if (mvLoc) this.gl.uniformMatrix4fv(mvLoc, false, identity);
        if (pLoc) this.gl.uniformMatrix4fv(pLoc, false, identity);

        // params에서 uniforms 초기화 (Curtains.js format)
        if (this.params.uniforms) {
            for (const [key, uniformData] of Object.entries(this.params.uniforms)) {
                this.uniforms[key] = {
                    name: uniformData.name,
                    type: uniformData.type,
                    value: uniformData.value
                };
            }
        }

        // 컨테이너의 이미지들을 텍스처로 로드
        const images = this.container.querySelectorAll('img[data-sampler]');
        let loadedCount = 0;

        images.forEach((img, index) => {
            const samplerName = img.getAttribute('data-sampler');
            const texture = this.gl.createTexture();

            const loadTexture = () => {
                this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
                this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, this.gl.RGBA, this.gl.UNSIGNED_BYTE, img);
                this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
                this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
                this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
                this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);

                loadedCount++;
                if (loadedCount === images.length) {
                    this.isReady = true;
                    if (this.onReadyCallback) this.onReadyCallback();
                }
            };

            this.textures[samplerName] = { texture, unit: index };

            if (img.complete) {
                loadTexture();
            } else {
                img.addEventListener('load', loadTexture);
            }
        });

        // 이미지가 없으면 바로 ready
        if (images.length === 0) {
            this.isReady = true;
            if (this.onReadyCallback) this.onReadyCallback();
        }
    }

    _render() {
        this.animationId = requestAnimationFrame(() => this._render());

        if (!this.gl || !this.program) return;

        this.gl.useProgram(this.program);

        // 텍스처 바인딩
        Object.entries(this.textures).forEach(([name, data]) => {
            this.gl.activeTexture(this.gl.TEXTURE0 + data.unit);
            this.gl.bindTexture(this.gl.TEXTURE_2D, data.texture);
            const loc = this.gl.getUniformLocation(this.program, name);
            if (loc) this.gl.uniform1i(loc, data.unit);
        });

        // 유니폼 업데이트
        Object.entries(this.uniforms).forEach(([key, data]) => {
            const uniformName = data.name || key;
            const loc = this.gl.getUniformLocation(this.program, uniformName);
            if (!loc) return;

            const value = data.value;
            const type = data.type;

            if (type === '1i') {
                this.gl.uniform1i(loc, value);
            } else if (type === '1f') {
                this.gl.uniform1f(loc, value);
            } else if (type === '2f' || type === '2fv') {
                this.gl.uniform2fv(loc, value);
            } else if (type === '3f' || type === '3fv') {
                this.gl.uniform3fv(loc, value);
            } else if (type === '1fv') {
                this.gl.uniform1fv(loc, value);
            } else if (typeof value === 'number') {
                this.gl.uniform1f(loc, value);
            } else if (value instanceof Float32Array || Array.isArray(value)) {
                if (value.length === 2) {
                    this.gl.uniform2fv(loc, value);
                } else if (value.length === 3) {
                    this.gl.uniform3fv(loc, value);
                } else if (value.length === 4) {
                    this.gl.uniform4fv(loc, value);
                } else {
                    this.gl.uniform1fv(loc, value);
                }
            }
        });

        // Resolution 유니폼
        const resLoc = this.gl.getUniformLocation(this.program, 'uResolution');
        if (resLoc) {
            this.gl.uniform2f(resLoc, this.canvas.width, this.canvas.height);
        }

        // 렌더 콜백
        if (this.onRenderCallback) {
            this.onRenderCallback();
        }

        // Clear & Draw
        this.gl.clearColor(0, 0, 0, 0);
        this.gl.clear(this.gl.COLOR_BUFFER_BIT);

        this.gl.enable(this.gl.BLEND);
        this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);

        this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
        this.gl.drawElements(this.gl.TRIANGLES, 6, this.gl.UNSIGNED_SHORT, 0);
    }

    getBoundingRect() {
        return this.container.getBoundingClientRect();
    }

    mouseToPlaneCoords(mouseX, mouseY) {
        const rect = this.container.getBoundingClientRect();
        return {
            x: (mouseX - rect.left) / rect.width,
            y: 1.0 - (mouseY - rect.top) / rect.height
        };
    }

    onReady(callback) {
        this.onReadyCallback = callback;
        if (this.isReady) callback();
        return this;
    }

    onRender(callback) {
        this.onRenderCallback = callback;
        return this;
    }

    onAfterResize(callback) {
        this.onAfterResizeCallback = callback;
        window.addEventListener('resize', () => {
            this._resize();
            if (callback) callback();
        });
        return this;
    }

    onError(callback) {
        this.onErrorCallback = callback;
        return this;
    }

    remove() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
        }
        if (this.canvas && this.canvas.parentNode) {
            this.canvas.parentNode.removeChild(this.canvas);
        }
    }
}
