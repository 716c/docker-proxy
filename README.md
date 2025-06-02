# docker-proxy
# 配置 Docker 守护进程使用 HTTP/HTTPS 代理

**目标：**
本文档旨在指导用户如何在 Linux 系统上配置 Docker 守护进程，使其在执行 `docker pull` 等操作时，通过指定的 HTTP/HTTPS 代理服务器进行网络连接。这对于访问受限或速度较慢的 Docker Registry (如 Docker Hub, ghcr.io 等) 非常有用。

**背景：**
在本次配置过程中，我们尝试了通过 Docker 的 `daemon.json` 文件进行代理配置，但遇到了持续的、难以解释的解析错误，即使在理论上配置正确的情况下也是如此。因此，我们最终采用了通过 systemd drop-in 文件为 Docker 守护进程设置环境变量的方法，此方法被证明是稳定和有效的。

**前提条件：**
1.  你正在使用的 Linux 系统使用 systemd 进行服务管理。
2.  你有一个可用的 HTTP/HTTPS 代理服务器 (例如，你本地或旁路由上运行的 mihomo/Clash 等)。
3.  你知道代理服务器的 IP 地址和端口号。
4.  (可选) 如果代理服务器需要认证，你知道用户名和密码（并对密码中的特殊字符进行了 URL 编码）。

**配置方法：使用 systemd Drop-in 文件设置环境变量**

这种方法通过为 Docker 服务单元创建一个补充配置文件，来设置 `HTTP_PROXY`, `HTTPS_PROXY`, 和 `NO_PROXY` 环境变量。Docker 守护进程会识别并使用这些标准的环境变量。

**步骤：**

1.  **创建 systemd drop-in 目录 (如果不存在)**
    打开终端，执行以下命令：
    ```bash
    sudo mkdir -p /etc/systemd/system/docker.service.d
    ```

2.  **创建并编辑代理配置文件**
    使用文本编辑器（如 `nano`）创建或编辑该文件：
    ```bash
    sudo nano /etc/systemd/system/docker.service.d/http-proxy.conf
    ```
    在该文件中，输入以下内容。**请务必将 `YOUR_PROXY_IP` 和 `YOUR_PROXY_PORT` 替换为你的实际代理服务器 IP 和端口。**

    ```ini
    [Service]
    Environment="HTTP_PROXY=http://YOUR_PROXY_IP:YOUR_PROXY_PORT"
    Environment="HTTPS_PROXY=http://YOUR_PROXY_IP:YOUR_PROXY_PORT"
    Environment="NO_PROXY=localhost,127.0.0.1,*.example.com,192.168.0.0/16"
    ```

    **说明：**
    *   **`[Service]`**: 这是必需的区段头，表明这些配置应用于服务本身。
    *   **`Environment="HTTP_PROXY=..."`**: 设置 HTTP 代理。
    *   **`Environment="HTTPS_PROXY=..."`**: 设置 HTTPS 代理。注意，其值通常也是以 `http://` 开头，除非你的代理服务器本身要求通过 HTTPS 连接它（这不常见）。
    *   **`Environment="NO_PROXY=..."`**: 设置一个逗号分隔的列表，指定哪些主机名、IP 地址或 IP 地址范围不应通过代理访问。例如：
        *   `localhost,127.0.0.1`: 总是推荐包含。
        *   `*.example.com`: 排除所有 `example.com` 的子域名。
        *   `192.168.0.0/16`: 排除整个 `192.168.x.x` 网段。
        *   如果你有内部的 Docker Registry 或其他不需要代理的服务，请将其添加到此列表。
    *   **如果你的代理需要用户名和密码认证：**
        URL 格式应为：`http://用户名:URL编码后的密码@YOUR_PROXY_IP:YOUR_PROXY_PORT`
        例如：`Environment="HTTP_PROXY=http://myuser:p%40ssword@10.0.0.5:7890"`

    仔细检查内容后，保存文件并退出编辑器 (在 `nano` 中是 `Ctrl+O`, `Enter`, `Ctrl+X`)。

3.  **重新加载 systemd 管理器配置**
    使 systemd 读取到新的 drop-in 配置文件：
    ```bash
    sudo systemctl daemon-reload
    ```

4.  **重启 Docker 服务**
    应用新的环境变量并重启 Docker 守护进程：
    ```bash
    sudo systemctl restart docker.service
    ```

**验证配置：**

1.  **检查 Docker 服务状态：**
    ```bash
    sudo systemctl status docker.service
    ```
    确保输出中的 `Active:` 状态为 `active (running)`，并且在 `Drop-In:` 部分能看到你创建的 `http-proxy.conf` 文件。同时，不应该再出现关于 `Assignment outside of section` 的警告。

2.  **测试拉取镜像：**
    尝试拉取一个公共镜像，例如 `alpine` (来自 Docker Hub) 或一个明确的公开 `ghcr.io` 镜像：
    ```bash
    docker pull alpine
    docker pull ghcr.io/oras-project/oras:v1.1.0
    ```
    如果镜像能够成功下载，说明代理配置已生效。你可以观察下载速度或查看代理服务器的日志来进一步确认流量是否通过代理。

**使用说明：**
配置完成后，所有由 Docker 守护进程发起的网络请求（包括 `docker pull`, `docker push`, `docker search` 以及构建镜像时下载基础镜像等）都将自动通过你配置的代理服务器。

*   **对于需要认证的私有 Registry (如私有的 `ghcr.io` 镜像)：**
    你仍然需要像往常一样使用 `docker login <registry_url>` 进行登录。Docker 客户端会将认证凭据附加到请求头中，这些请求头会通过代理服务器转发给目标 Registry。例如，登录 `ghcr.io`：
    ```bash
    echo "YOUR_GITHUB_PAT" | docker login ghcr.io -u YOUR_GITHUB_USERNAME --password-stdin
    ```

**关于你的 Cloudflare Pages 代理镜像站：**
本文档描述的配置使 Docker 守护进程通过一个通用的 HTTP/HTTPS 代理（例如你的 mihomo）。如果你希望这些流量最终通过你之前创建的 Cloudflare Pages Docker 代理 (例如 `https://your-project.pages.dev`)，你需要在你的通用代理（mihomo）中配置相应的规则，将访问 `registry-1.docker.io` 或 `ghcr.io` 等特定域名的流量，转发到你的 Cloudflare Pages 代理的对应路径 (例如 `https://your-project.pages.dev/docker.io/...` 或 `https://your-project.pages.dev/ghcr.io/...`)。

**关于 `daemon.json` 的说明：**
Docker 官方推荐使用 `/etc/docker/daemon.json` 文件并通过其内部的 `proxies` 键来配置代理。然而，在本次特定的、长时间的故障排除过程中，即使使用了理论上完全正确的 JSON 结构，Docker 守护进程也持续报告关于 `default` 指令的无法解释的解析错误。因此，对于当前场景，通过 systemd 环境变量配置代理被证明是更稳定和有效的解决方案。如果未来 Docker 版本或你的系统环境有所变化，或者你希望再次尝试，可以参考 Docker 官方文档关于 `daemon.json` 的代理配置。
