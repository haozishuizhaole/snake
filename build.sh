#!/bin/bash

# 设置颜色输出
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# 打印带颜色的信息
info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 创建构建目录
BUILD_DIR="build"
info "Creating build directory..."
rm -rf $BUILD_DIR
mkdir -p $BUILD_DIR

# 编译
info "Building snake game..."
if go build -o $BUILD_DIR/snake main.go; then
    info "Build successful!"
else
    error "Build failed!"
    exit 1
fi

# 复制必要的文件
info "Copying required files..."
cp -r static $BUILD_DIR/
cp -r templates $BUILD_DIR/
cp -r versions $BUILD_DIR/

info "Build completed! Files are in the '$BUILD_DIR' directory." 