@echo off
REM 打包浏览器插件为 zip 文件，用于发布 Release

echo ================================================
echo 打包 Claude Account Switcher 插件
echo ================================================
echo.

REM 进入插件目录
cd extension

echo [1/4] 清理旧文件...
if exist dist rmdir /s /q dist
if exist ..\extension.zip del ..\extension.zip

echo [2/4] 安装依赖...
call npm install

echo [3/4] 编译插件...
call npm run build

echo [4/4] 打包 zip...
cd dist
powershell -Command "Compress-Archive -Path * -DestinationPath ..\..\extension.zip -Force"
cd ..\..

echo.
echo ================================================
echo 打包完成！
echo ================================================
echo.
echo 文件位置: %CD%\extension.zip
echo.
echo 下一步：
echo 1. 在 GitHub 创建新 Release
echo 2. 上传 extension.zip 文件
echo 3. 填写版本说明
echo.
pause
