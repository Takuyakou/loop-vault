$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @"
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
public static class P12PixelComparison {
 public static double[] Compare(string reference, string actual, string overlay, string diff) {
  using(var a=new Bitmap(reference)) using(var b=new Bitmap(actual)) using(var o=new Bitmap(a.Width,a.Height)) using(var d=new Bitmap(a.Width,a.Height)) {
   if(a.Width!=b.Width || a.Height!=b.Height) throw new Exception("Comparison dimensions differ");
   var rect=new Rectangle(0,0,a.Width,a.Height);
   var ad=a.LockBits(rect,ImageLockMode.ReadOnly,PixelFormat.Format32bppArgb);
   var bd=b.LockBits(rect,ImageLockMode.ReadOnly,PixelFormat.Format32bppArgb);
   var od=o.LockBits(rect,ImageLockMode.WriteOnly,PixelFormat.Format32bppArgb);
   var dd=d.LockBits(rect,ImageLockMode.WriteOnly,PixelFormat.Format32bppArgb);
   var av=new byte[ad.Stride*a.Height];var bv=new byte[bd.Stride*b.Height];var ov=new byte[od.Stride*o.Height];var dv=new byte[dd.Stride*d.Height];
   Marshal.Copy(ad.Scan0,av,0,av.Length);Marshal.Copy(bd.Scan0,bv,0,bv.Length);long sum=0,changed=0;
   for(int y=0;y<a.Height;y++)for(int x=0;x<a.Width;x++) {int ia=y*ad.Stride+x*4,ib=y*bd.Stride+x*4,io=y*od.Stride+x*4,id=y*dd.Stride+x*4,max=0;
    for(int c=0;c<3;c++){int delta=Math.Abs(av[ia+c]-bv[ib+c]);sum+=delta;max=Math.Max(max,delta);ov[io+c]=(byte)((av[ia+c]+bv[ib+c])/2);}
    ov[io+3]=255;dv[id+3]=255;if(max>16){changed++;dv[id]=90;dv[id+1]=70;dv[id+2]=255;}else{dv[id]=av[ia];dv[id+1]=av[ia+1];dv[id+2]=av[ia+2];}
   }
   Marshal.Copy(ov,0,od.Scan0,ov.Length);Marshal.Copy(dv,0,dd.Scan0,dv.Length);a.UnlockBits(ad);b.UnlockBits(bd);o.UnlockBits(od);d.UnlockBits(dd);o.Save(overlay,ImageFormat.Png);d.Save(diff,ImageFormat.Png);
   return new double[]{(double)changed/(a.Width*a.Height),(double)sum/(a.Width*a.Height*3)};
  }
 }
}
"@ -ReferencedAssemblies System.Drawing
$reviewRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../p12-generated/P12.0-01/mock-ui-review'))
$manifest = Get-Content -LiteralPath (Join-Path $reviewRoot 'manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$metrics = @()
$sections = @()
foreach($case in $manifest.manifest) {
 $name=$case.name
 $before=[P12PixelComparison]::Compare((Join-Path $reviewRoot "$name-mock.png"),(Join-Path $reviewRoot "$name-before.png"),(Join-Path $reviewRoot "$name-before-overlay.png"),(Join-Path $reviewRoot "$name-before-diff.png"))
 $after=[P12PixelComparison]::Compare((Join-Path $reviewRoot "$name-mock.png"),(Join-Path $reviewRoot "$name-after.png"),(Join-Path $reviewRoot "$name-after-overlay.png"),(Join-Path $reviewRoot "$name-after-diff.png"))
 $metrics+=@{name=$name;beforeChangedRatio=$before[0];afterChangedRatio=$after[0];beforeMeanAbsoluteRGB=$before[1];afterMeanAbsoluteRGB=$after[1]}
 $sections+="<section><h2>$name</h2><p>Changed pixels (channel difference &gt;16): before $([math]::Round($before[0]*100,2))%, after $([math]::Round($after[0]*100,2))%. Descriptive comparison; no automatic visual approval.</p><div class='triplet'><figure><figcaption>ZIP mock / same synthetic state</figcaption><img src='$name-mock.png'></figure><figure><figcaption>Before a927fa59</figcaption><img src='$name-before.png'></figure><figure><figcaption>After current source</figcaption><img src='$name-after.png'></figure></div><details><summary>50% overlay and actual pixel difference (red)</summary><img src='$name-after-overlay.png'><img src='$name-after-diff.png'></details><p><a href='$name-before-full.png'>Before native full frame</a> / <a href='$name-after-full.png'>After native full frame</a></p></section>"
}
$metrics | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $reviewRoot 'pixel-metrics.json') -Encoding UTF8
$html="<!doctype html><meta charset='utf-8'><title>P12 mock comparison</title><style>body{font:14px system-ui;background:#0a1019;color:#f2f6fc;margin:24px}a{color:#42d8c6}.triplet{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}figure{margin:0}img{width:100%;height:auto}details img{max-width:1208px}section{margin:32px 0}p{max-width:110ch;line-height:1.6}</style><h1>P12 UI review: original / before / after</h1><p>合成データのみ。比較領域1208×808、実画面1440×900。製品の既存枠（サイドバー232px、タイトルバー36px＋ヘッダー56px）は維持。元モックは56px＋52pxのため、同条件比較コピーだけ枠の寸法を調整しています。比較コピーの内容は初日のメジャー三和音＋I–V–vi–IV、記録1.2s/6.4s/9日前へ合わせました。元ZIPファイルは変更していません。デモ専用ボタンの除去、v1.4の音と答え非表示規則の反映はmanifest.jsonに記録。画素一致をPASSとする報告ではありません。</p><p><a href='manifest.json'>comparison conditions</a> / <a href='pixel-metrics.json'>actual pixel metrics</a> / <a href='original-home.png'>Unchanged original home .screen</a> / <a href='original-composition.png'>Original composition .screen</a> / <a href='original-progression.png'>Original progression .screen</a> / <a href='original-finish.png'>Original finish .screen</a></p>" + ($sections -join "`n")
$html | Set-Content -LiteralPath (Join-Path $reviewRoot 'index.html') -Encoding UTF8
$metrics | Format-Table
