#!/bin/bash

# 脚本功能：为 Docker 守护进程配置 systemd 代理设置

# 检查是否以 root 权限运行
if [ "$(id -u)" -ne 0 ]; then
  echo "错误：此脚本需要 root 权限来修改 systemd 配置和重启 Docker 服务。" >&2
  echo "请使用 'sudo $0' 重新运行此脚本。" >&2
  exit 1
fi

# 函数：检查命令是否存在
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# 函数：打印错误信息并退出
error_exit() {
    echo "错误: $1" >&2
    exit 1
}

# 函数：URL 编码字符串 (需要 python3)
urlencode_string() {
    if ! command_exists python3; then
        error_exit "需要 python3 来进行密码的 URL 编码。请先安装 python3。"
    fi
    python3 -c "import urllib.parse; print(urllib.parse.quote(input(), safe=''))" <<< "$1"
}

echo "Docker 守护进程代理配置脚本"
echo "-----------------------------------"
echo "本脚本将帮助您为 Docker 服务配置 HTTP/HTTPS 代理。"
echo "配置文件将被创建或覆盖在: /etc/systemd/system/docker.service.d/http-proxy.conf"
echo "-----------------------------------"

# 0. 检查依赖
if ! command_exists systemctl; then
    error_exit "systemctl 命令未找到。此脚本适用于使用 systemd 的系统。"
fi
if ! command_exists docker; then
    echo "警告: docker 命令未找到。请确保 Docker 已安装，否则此配置可能无效。"
fi


# 1. 获取用户输入
while true; do
    read -p "请输入代理服务器的 IP 地址 (例如 192.168.1.100): " PROXY_IP
    if [[ -z "$PROXY_IP" ]]; then
        echo "代理 IP 地址不能为空。"
    else
        # 简单的 IP 格式校验 (非严格)
        if [[ ! "$PROXY_IP" =~ ^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$ && "$PROXY_IP" != "localhost" ]]; then
             read -p "输入的 IP 地址 '$PROXY_IP' 格式可能不正确。是否继续? (y/N): " confirm_ip
             if [[ "${confirm_ip,,}" != "y" ]]; then
                 continue
             fi
        fi
        break
    fi
done

while true; do
    read -p "请输入代理服务器的端口号 (例如 8080 或 7890): " PROXY_PORT
    if [[ -z "$PROXY_PORT" ]]; then
        echo "代理端口号不能为空。"
    elif ! [[ "$PROXY_PORT" =~ ^[0-9]+$ ]] || ((PROXY_PORT < 1 || PROXY_PORT > 65535)); then
        echo "端口号必须是 1-65535 之间的数字。"
    else
        break
    fi
done

PROXY_AUTH_STRING=""
read -p "您的代理是否需要用户名和密码认证? (y/N): " REQUIRES_AUTH
if [[ "${REQUIRES_AUTH,,}" == "y" ]]; then
    read -p "请输入代理用户名: " PROXY_USER
    if [[ -z "$PROXY_USER" ]]; then
        echo "警告: 用户名为空。"
    fi
    read -sp "请输入代理密码: " PROXY_PASS
    echo # 换行
    if [[ -z "$PROXY_PASS" ]]; then
        echo "警告: 密码为空。"
    fi

    if [[ -n "$PROXY_USER" ]]; then # 只有用户名不为空时才添加认证信息
        ENCODED_PASS=$(urlencode_string "$PROXY_PASS")
        if [ $? -ne 0 ]; then # 检查 urlencode_string 是否成功
            error_exit "密码 URL 编码失败。"
        fi
        PROXY_AUTH_STRING="${PROXY_USER}:${ENCODED_PASS}@"
        echo "信息: 密码已进行 URL 编码。"
    else
        echo "信息: 由于用户名为空，将不添加认证信息到代理 URL。"
    fi
fi

# NO_PROXY 设置
DEFAULT_NO_PROXY="localhost,127.0.0.1"
read -p "请输入 NO_PROXY 列表 (逗号分隔, 默认为 '${DEFAULT_NO_PROXY}', 可追加, 例如: *.example.com,10.0.0.0/8): " USER_NO_PROXY
if [[ -z "$USER_NO_PROXY" ]]; then
    NO_PROXY_LIST="${DEFAULT_NO_PROXY}"
else
    # 检查用户输入是否以逗号开头/结尾，或者是否包含默认值，以避免重复
    if [[ "$USER_NO_PROXY" != *"$DEFAULT_NO_PROXY"* ]]; then
        NO_PROXY_LIST="${DEFAULT_NO_PROXY},${USER_NO_PROXY}"
    else
        NO_PROXY_LIST="${USER_NO_PROXY}"
    fi
    # 清理可能的多余逗号
    NO_PROXY_LIST=$(echo "$NO_PROXY_LIST" | sed 's/,,*/,/g' | sed 's/^,//g' | sed 's/,$//g')
fi
echo "最终 NO_PROXY 列表: ${NO_PROXY_LIST}"


# 2. 构建代理字符串
HTTP_PROXY_URL="http://${PROXY_AUTH_STRING}${PROXY_IP}:${PROXY_PORT}"
# HTTPS_PROXY 通常也使用 http:// 协议连接到代理服务器
HTTPS_PROXY_URL="http://${PROXY_AUTH_STRING}${PROXY_IP}:${PROXY_PORT}"

echo ""
echo "将要配置的代理信息如下:"
echo "  HTTP_PROXY:  ${HTTP_PROXY_URL}"
echo "  HTTPS_PROXY: ${HTTPS_PROXY_URL}"
echo "  NO_PROXY:    ${NO_PROXY_LIST}"
echo ""
read -p "确认以上信息并继续配置吗? (y/N): " CONFIRM_SETTINGS
if [[ "${CONFIRM_SETTINGS,,}" != "y" ]]; then
    echo "操作已取消。"
    exit 0
fi

# 3. 创建 systemd drop-in 目录
DROP_IN_DIR="/etc/systemd/system/docker.service.d"
echo "正在创建目录 (如果不存在): ${DROP_IN_DIR}..."
mkdir -p "${DROP_IN_DIR}"
if [ $? -ne 0 ]; then
    error_exit "创建目录 ${DROP_IN_DIR} 失败。请检查权限。"
fi
echo "目录创建成功或已存在。"

# 4. 创建并编辑代理配置文件
CONF_FILE="${DROP_IN_DIR}/http-proxy.conf"
echo "正在写入配置文件: ${CONF_FILE}..."

# 使用 cat 和 EOF 来写入多行内容，并通过 sudo tee 写入文件
cat <<EOF | tee "${CONF_FILE}" > /dev/null
[Service]
Environment="HTTP_PROXY=${HTTP_PROXY_URL}"
Environment="HTTPS_PROXY=${HTTPS_PROXY_URL}"
Environment="NO_PROXY=${NO_PROXY_LIST}"
EOF

if [ $? -ne 0 ]; then
    error_exit "写入配置文件 ${CONF_FILE} 失败。请检查权限或磁盘空间。"
fi
echo "配置文件写入成功。"

# 5. 重新加载 systemd 管理器配置
echo "正在重新加载 systemd 管理器配置 (sudo systemctl daemon-reload)..."
systemctl daemon-reload
if [ $? -ne 0 ]; then
    error_exit "systemctl daemon-reload 执行失败。"
fi
echo "systemd 管理器配置重新加载成功。"

# 6. 重启 Docker 服务
echo "正在重启 Docker 服务 (sudo systemctl restart docker.service)..."
systemctl restart docker.service
if [ $? -ne 0 ]; then
    # 尝试提供一些调试信息
    echo "错误: systemctl restart docker.service 执行失败。" >&2
    echo "您可以尝试手动执行 'sudo systemctl status docker.service' 和 'journalctl -xeu docker.service' 查看详细错误。" >&2
    exit 1
fi
echo "Docker 服务重启成功。"
echo ""
echo "-----------------------------------"
echo "Docker 守护进程代理配置完成！"
echo "-----------------------------------"
echo ""
echo "验证步骤:"
echo "1. 检查 Docker 服务状态:"
echo "   sudo systemctl status docker.service"
echo "   - 确保 Active 状态为 'active (running)'。"
echo "   - 在 'Drop-In:' 部分应该能看到 '${CONF_FILE}'。"
echo ""
echo "2. 检查 Docker 是否能通过代理拉取镜像 (选择一个您本地没有的小镜像):"
echo "   sudo docker pull hello-world"
echo "   (如果之前已拉取, 先删除: sudo docker rmi hello-world)"
echo ""
echo "3. 如需移除代理配置:"
echo "   a. 删除文件: sudo rm ${CONF_FILE}"
echo "   b. sudo systemctl daemon-reload"
echo "   c. sudo systemctl restart docker.service"
echo ""

exit 0
