// src/lib/share-contact.ts
export async function shareContact(companyName: string) {
  if (navigator.share) {
    await navigator.share({
      title: companyName,
      text: 'Контакты организации',
      url: window.location.href,
    })
  } else {
    // Fallback: copy current URL to clipboard
    await navigator.clipboard.writeText(window.location.href)
    // Можно показать уведомление, но для простоты просто копируем
  }
}