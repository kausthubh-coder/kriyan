// A QR code for https://kriyan.app/android, so someone on a computer can open the page on their
// phone. 25 by 25 modules (version 2, medium error correction), drawn as one stroked path, one
// unit per module. Made once with the qrcode package; to change the address, run
//   bunx qrcode@1.5.4 -t svg -e M -q 0 -o qr.svg "<address>"
// and copy the stroked path's d here.

export const ANDROID_QR_URL = "https://kriyan.app/android";
export const ANDROID_QR_MODULES = 25;
export const ANDROID_QR_PATH =
  "M0 0.5h7m2 0h1m2 0h1m1 0h1m1 0h1m1 0h7M0 1.5h1m5 0h1m2 0h1m2 0h1m2 0h1m2 0h1m5 0h1M0 2.5h1m1 0h3m1 0h1m1 0h1m3 0h1m2 0h1m2 0h1m1 0h3m1 0h1M0 3.5h1m1 0h3m1 0h1m1 0h1m2 0h1m1 0h1m1 0h2m1 0h1m1 0h3m1 0h1M0 4.5h1m1 0h3m1 0h1m1 0h2m1 0h1m1 0h1m2 0h1m1 0h1m1 0h3m1 0h1M0 5.5h1m5 0h1m1 0h1m1 0h1m1 0h5m1 0h1m5 0h1M0 6.5h7m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h7M8 7.5h2m4 0h2M0 8.5h1m1 0h5m2 0h2m2 0h3m2 0h5M1 9.5h5m2 0h1m2 0h2m3 0h2m1 0h1m3 0h1M0 10.5h1m1 0h1m1 0h1m1 0h1m3 0h3m2 0h1m2 0h4m1 0h2M0 11.5h3m2 0h1m1 0h1m2 0h3m1 0h1m1 0h1m3 0h1m3 0h1M0 12.5h1m2 0h1m1 0h3m3 0h4m2 0h2m1 0h1m1 0h3M0 13.5h1m1 0h1m1 0h1m3 0h2m2 0h2m5 0h1m1 0h1m1 0h1M0 14.5h1m3 0h5m1 0h1m1 0h4m3 0h3m1 0h2M0 15.5h1m1 0h1m1 0h1m2 0h2m1 0h1m5 0h5m3 0h1M0 16.5h1m1 0h3m1 0h1m3 0h1m1 0h3m1 0h5m1 0h1M8 17.5h2m1 0h1m3 0h2m3 0h2M0 18.5h7m3 0h1m3 0h1m1 0h1m1 0h1m1 0h1m1 0h3M0 19.5h1m5 0h1m1 0h2m2 0h1m3 0h1m3 0h2M0 20.5h1m1 0h3m1 0h1m1 0h1m2 0h10m1 0h1M0 21.5h1m1 0h3m1 0h1m1 0h4m2 0h1m2 0h2m1 0h5M0 22.5h1m1 0h3m1 0h1m1 0h3m2 0h1m1 0h1m1 0h1m3 0h2m1 0h1M0 23.5h1m5 0h1m3 0h2m3 0h2m2 0h3m2 0h1M0 24.5h7m1 0h1m2 0h4m2 0h8";
