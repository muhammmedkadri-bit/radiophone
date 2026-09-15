# Render.com Canlı Yayın Dağıtım Kılavuzu

Radiophone projeniz, Render.com üzerinde **7/24 kesintisiz çalışan bir Web Service** olarak tek tıkla yayınlanmaya hazır hale getirilmiştir.

---

## 1. Adım: Projeyi GitHub'a Yükleyin

Proje dizininde yerel Git reponuz oluşturulmuş ve ilk commit atılmıştır. GitHub'da yeni bir boş repo açın (örneğin: `radiophone`) ve terminalden şu iki komutu çalıştırın:

```bash
cd /Users/m.k./Desktop/Radiophone
git remote add origin https://github.com/KULLANICI_ADINIZ/radiophone.git
git push -u origin main
```

---

## 2. Adım: Render.com'a Bağlayın (Ücretsiz)

1. [Render.com](https://render.com) adresine gidin ve GitHub hesabınızla giriş yapın.
2. Sağ üstteki **"New +"** butonuna tıklayıp **"Web Service"** seçin.
3. GitHub'daki `radiophone` reponuzu seçin.
4. Render ayarları otomatik algılayacaktır (`render.yaml` hazır durumdadır):
   - **Name:** `radiophone`
   - **Runtime:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** `Free`
5. **"Deploy Web Service"** butonuna basın.

---

## 3. Adım: Canlıya Alındı!

1-2 dakika içinde projeniz canlıya geçecektir:
* **Canlı Web Siteniz:** `https://radiophone.onrender.com`
* **Apple HLS Doğrudan Canlı Akışı:** `https://radiophone.onrender.com/live`
* **Kendi Özel Alan Adınızı Bağlamak İsterseniz:** Render panelinde **Settings > Custom Domains** sekmesinden kendi domaininizi (`radyo.siteniz.com`) 1 dakikada ekleyebilirsiniz. Render ücretsiz SSL sertifikasını (HTTPS) otomatik olarak tanımlar.
