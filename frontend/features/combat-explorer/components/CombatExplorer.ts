import { ProjectPanelController, type ProjectPanelProps } from "../../project-workspace/components/ProjectPanel.js";
import { DirectorChatController, type DirectorChatProps } from "../../director-chat/components/DirectorChat.js";

export interface CombatExplorerConfig {
  workspaceId: string;
  projectPanelProps?: Partial<ProjectPanelProps>;
  directorChatProps?: Partial<DirectorChatProps>;
}

export class CombatExplorerController {
  public readonly workspaceId: string;
  public readonly projectPanel: ProjectPanelController;
  public readonly directorChat: DirectorChatController;

  constructor(config: CombatExplorerConfig) {
    this.workspaceId = config.workspaceId;
    this.projectPanel = new ProjectPanelController({
      workspaceId: config.workspaceId,
      ...config.projectPanelProps,
    });
    this.directorChat = new DirectorChatController({
      workspaceId: config.workspaceId,
      ...config.directorChatProps,
    });
  }

  public renderLayout() {
    return {
      layout: "two-column",
      workspaceId: this.workspaceId,
      leftColumn: {
        name: "ProjectPanel",
        data: this.projectPanel.renderModel(),
      },
      rightColumn: {
        name: "DirectorChat",
        data: this.directorChat.renderModel(),
      },
    };
  }
}
