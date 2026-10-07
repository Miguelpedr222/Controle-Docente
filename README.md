# Fiscaliza Docente — PWA pronta

Esta versão já está preparada para funcionar como um aplicativo instalado na tela inicial
de um tablet/celular Android, sem precisar criar APK.

## O que foi adicionado

- `manifest.webmanifest` — configura o aplicativo instalado.
- `sw.js` — cache/offline da aplicação.
- Ícones `192x192` e `512x512`.
- Registro automático do Service Worker no `index.html`.
- Configuração para abrir em modo `standalone`, sem a barra normal do navegador.

## Como publicar

### Opção recomendada: GitHub Pages

1. Crie um repositório no GitHub.
2. Envie o conteúdo desta pasta (`fiscaliza-docente-v3-3`) para o repositório.
3. Em **Settings → Pages**, habilite o GitHub Pages pela branch principal.
4. Aguarde a publicação.
5. Abra o endereço HTTPS gerado no Chrome do tablet.

> O GitHub Pages precisa servir o projeto por HTTPS para a instalação PWA funcionar corretamente.

## Como instalar no Android

1. Abra o endereço do sistema **uma única vez** no Chrome do tablet.
2. No menu do Chrome, escolha **Instalar app** ou **Adicionar à tela inicial**.
3. Confirme.
4. O ícone **Fiscaliza Docente** aparecerá na tela inicial.
5. Depois disso, basta tocar no ícone. Você não precisa abrir o Chrome manualmente nem digitar o endereço novamente.

## Importante sobre os dados

O sistema atual usa IndexedDB e localStorage, portanto os registros ficam salvos
localmente no dispositivo. O tablet e o notebook não compartilham automaticamente os
mesmos registros.

Para usar os mesmos dados em vários dispositivos, será necessário futuramente adicionar
um banco de dados online/sincronização.

## Teste local

Para desenvolvimento, continue usando o Live Server do VS Code. O PWA pode ser testado
em `localhost`. Para instalação em um tablet, publique em HTTPS.
