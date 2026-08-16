import type { AppLanguage } from "./i18n";

export type LegalDoc = "privacy" | "terms" | "about";

interface Section {
  title: string;
  body: string;
}

const docs: Record<
  AppLanguage,
  Record<LegalDoc, { title: string; sections: Section[] }>
> = {
  pt: {
    privacy: {
      title: "Privacidade",
      sections: [
        {
          title: "O que o app faz",
          body: "Who is? identifica figuras públicas a partir da câmera ou de um print. O objetivo é uso pessoal, educacional e de entretenimento — por exemplo, descobrir quem é a pessoa numa série ou filme.",
        },
        {
          title: "Imagens",
          body: "A foto ou o print que você envia vai para o nosso servidor e, em seguida, para o Amazon Rekognition (AWS) só para reconhecer o rosto. Não vendemos imagens. Não usamos suas fotos para anúncio. Após a identificação, a imagem do scan comum não fica guardada no servidor.",
        },
        {
          title: "O que podemos guardar",
          body: "Idioma escolhido e se você já viu o guia inicial ficam só neste aparelho (localStorage). Se o administrador ensinar uma pessoa ao sistema, o rosto indexado e o nome/Wikipedia associados são guardados para scans futuros. Isso não é um cadastro seu.",
        },
        {
          title: "LGPD",
          body: "Não pedimos nome, e-mail ou cadastro. A imagem do scan é usada só para identificar a figura pública na hora e não fica guardada depois. Você pode recusar a câmera e enviar um print.",
        },
      ],
    },
    terms: {
      title: "Termos",
      sections: [
        {
          title: "Uso permitido",
          body: "O app é para identificar figuras públicas (atores, músicos, influenciadores etc.) em conteúdo que você tem o direito de ver — por exemplo, a TV em casa. Não use para vigiar pessoas, identificar desconhecidos na rua ou qualquer fim ilegal.",
        },
        {
          title: "Resultados podem errar",
          body: "O reconhecimento não é perfeito. Pode falhar, confundir homônimos ou sugerir a pessoa errada. Confira sempre a Wikipedia. Who is? é entretenimento e consulta rápida, não identificação oficial.",
        },
        {
          title: "Responsabilidade",
          body: "Você é responsável por como usa o app e as informações. Não nos responsabilizamos por decisões tomadas só com base num resultado do Who is?",
        },
      ],
    },
    about: {
      title: "Sobre",
      sections: [
        {
          title: "Como usar",
          body: "Pause o vídeo, aponte a câmera para o rosto e toque na mira. Também pode enviar um print. Funciona melhor com o rosto de frente, nítido e bem iluminado.",
        },
        {
          title: "Idiomas",
          body: "A interface está em português e inglês. A Wikipedia pode abrir no idioma disponível para aquela pessoa.",
        },
        {
          title: "É grátis?",
          body: "Sim, para quem usa o app. O reconhecimento usa serviços na nuvem; por isso o primeiro acesso do dia pode demorar alguns segundos enquanto o servidor acorda.",
        },
        {
          title: "Limites",
          body: "Não cobre todas as pessoas do mundo. Funciona melhor com figuras públicas conhecidas. Fotos de tela, movimento e pouca luz dificultam o reconhecimento.",
        },
      ],
    },
  },
  en: {
    privacy: {
      title: "Privacy",
      sections: [
        {
          title: "What the app does",
          body: "Who is? identifies public figures from your camera or a screenshot. It is meant for personal, educational, and entertainment use — for example, finding out who is on a TV show.",
        },
        {
          title: "Images",
          body: "The photo or screenshot you send goes to our server and then to Amazon Rekognition (AWS) only to recognize the face. We do not sell images. We do not use your photos for ads. After a normal scan, the image is not kept on the server.",
        },
        {
          title: "What we may store",
          body: "Your language choice and whether you dismissed the first-run guide stay on this device (localStorage). If an administrator teaches the system a person, that indexed face plus name/Wikipedia is stored for future scans. That is not an account about you.",
        },
        {
          title: "Your rights",
          body: "We do not ask for a name, email, or account. The scan image is used only to identify the public figure in that moment and is not kept afterward. You can deny the camera and upload a screenshot instead.",
        },
      ],
    },
    terms: {
      title: "Terms",
      sections: [
        {
          title: "Allowed use",
          body: "Use the app to identify public figures (actors, musicians, influencers, and similar) in content you have a right to watch — for example, TV at home. Do not use it for surveillance, to identify strangers in public, or for any illegal purpose.",
        },
        {
          title: "Results can be wrong",
          body: "Recognition is imperfect. It can miss people, confuse namesakes, or suggest the wrong person. Always check Wikipedia. Who is? is entertainment and a quick lookup, not official identification.",
        },
        {
          title: "Responsibility",
          body: "You are responsible for how you use the app and its information. We are not liable for decisions made solely from a Who is? result.",
        },
      ],
    },
    about: {
      title: "About",
      sections: [
        {
          title: "How to use",
          body: "Pause the video, point the camera at the face, and tap the sight. You can also upload a screenshot. It works best with a clear, front-facing, well-lit face.",
        },
        {
          title: "Languages",
          body: "The interface is in Portuguese and English. Wikipedia may open in whichever language is available for that person.",
        },
        {
          title: "Is it free?",
          body: "Yes for people using the app. Recognition runs in the cloud, so the first visit of the day may take a few seconds while the server wakes up.",
        },
        {
          title: "Limits",
          body: "It does not cover everyone in the world. It works best with well-known public figures. Screen photos, motion, and low light make recognition harder.",
        },
      ],
    },
  },
};

export function getLegalDoc(lang: AppLanguage, doc: LegalDoc) {
  return docs[lang][doc];
}
