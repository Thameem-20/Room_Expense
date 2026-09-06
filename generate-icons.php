<?php

declare(strict_types=1);

function paint_icon(int $size, bool $maskable = false): GdImage
{
    $im = imagecreatetruecolor($size, $size);
    imagealphablending($im, true);
    imagesavealpha($im, true);

    $bg = imagecolorallocate($im, 26, 22, 18);
    $cream = imagecolorallocate($im, 246, 237, 217);
    $forest = imagecolorallocate($im, 31, 107, 74);
    imagefilledrectangle($im, 0, 0, $size, $size, $bg);

    $inset = $maskable ? (int) round($size * 0.18) : (int) round($size * 0.18);
    $cardX = $inset;
    $cardY = (int) round($size * 0.16);
    $cardW = $size - ($inset * 2);
    $cardH = (int) round($size * 0.68);
    imagefilledrectangle($im, $cardX, $cardY, $cardX + $cardW, $cardY + $cardH, $cream);

    $barH = (int) round($size * 0.08);
    imagefilledrectangle($im, $cardX, $cardY, $cardX + $cardW, $cardY + $barH, $forest);

    $lineColor = imagecolorallocate($im, 26, 22, 18);
    $pad = (int) round($size * 0.08);
    $y = $cardY + (int) round($size * 0.22);
    for ($i = 0; $i < 4; $i++) {
        imagefilledrectangle($im, $cardX + $pad, $y, $cardX + $cardW - $pad, $y + (int) round($size * 0.035), $lineColor);
        $y += (int) round($size * 0.09);
    }

    return $im;
}

$dir = __DIR__ . '/icons';
if (!is_dir($dir)) {
    mkdir($dir, 0755, true);
}

$files = [
    ['icon-192.png', 192, false],
    ['icon-512.png', 512, false],
    ['maskable-512.png', 512, true],
    ['apple-touch-icon.png', 180, false],
];

foreach ($files as [$name, $size, $maskable]) {
    $im = paint_icon($size, $maskable);
    imagepng($im, $dir . '/' . $name);
    imagedestroy($im);
}

echo "icons generated\n";
